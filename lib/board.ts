"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { weekStartISO } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";

/*
 * Live weekly board: you and your friends, ranked. Fetched from weekly_board(),
 * refreshed when any of your friends' point events change (Realtime), and every
 * 30 seconds as a fallback. Remembers ranks so moves can flash up or down.
 */

export type BoardRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  accent: string;
  points: number;
  streak_count: number;
  streak_last_on: string | null;
  is_me: boolean;
  rank: number;
};

export type Move = "up" | "down";

export type BoardView = {
  rows: BoardRow[] | null;
  /** Rank changes since the last refresh (or since your last visit this week). */
  moved: Record<string, Move>;
  error: boolean;
};

const POLL_MS = 30_000;
const seenKey = (userId: string) => `rivl:${userId}:ranks:${weekStartISO()}`;

class BoardStore {
  private view: BoardView = { rows: null, moved: {}, error: false };
  private listeners = new Set<() => void>();
  private channel: RealtimeChannel | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private clearMoves: ReturnType<typeof setTimeout> | undefined;
  private loading = false;
  private db: ReturnType<typeof createClient> | undefined;
  private get client() {
    return (this.db ??= createClient());
  }

  constructor(private userId: string) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.stop();
    };
  };
  getView = () => this.view;

  private emit(patch: Partial<BoardView>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private start() {
    void this.refresh();
    this.timer = setInterval(() => document.visibilityState === "visible" && void this.refresh(), POLL_MS);
    document.addEventListener("visibilitychange", this.onVisible);
    this.channel = this.client
      .channel(`board:${this.userId}`)
      // RLS limits this to your own and your friends' point events.
      .on("postgres_changes", { event: "*", schema: "public", table: "point_events" }, () => {
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => void this.refresh(), 400);
      })
      .subscribe();
  }

  private stop() {
    clearInterval(this.timer);
    document.removeEventListener("visibilitychange", this.onVisible);
    if (this.channel) void this.client.removeChannel(this.channel);
    this.channel = null;
  }

  private onVisible = () => {
    if (document.visibilityState === "visible") void this.refresh();
  };

  async refresh() {
    if (this.loading || !navigator.onLine) return;
    this.loading = true;
    try {
      const { data, error } = await this.client.rpc("weekly_board");
      if (error) return this.emit({ error: true });
      const rows = data as BoardRow[];
      this.emit({ rows, moved: this.diff(rows), error: false });
      try {
        localStorage.setItem(seenKey(this.userId), JSON.stringify(Object.fromEntries(rows.map((r) => [r.id, r.rank]))));
      } catch {}
    } finally {
      this.loading = false;
    }
  }

  private diff(rows: BoardRow[]): Record<string, Move> {
    let before: Record<string, number> | null = null;
    if (this.view.rows) before = Object.fromEntries(this.view.rows.map((r) => [r.id, r.rank]));
    else {
      try {
        before = JSON.parse(localStorage.getItem(seenKey(this.userId)) ?? "null");
      } catch {}
    }
    if (!before) return {};
    const moved: Record<string, Move> = {};
    for (const r of rows) {
      const was = before[r.id];
      if (was && was !== r.rank) moved[r.id] = r.rank < was ? "up" : "down";
    }
    // The arrows flash once; clear them so they don't repeat on the next refresh.
    clearTimeout(this.clearMoves);
    if (Object.keys(moved).length) this.clearMoves = setTimeout(() => this.emit({ moved: {} }), 1600);
    return moved;
  }
}

const stores = new Map<string, BoardStore>();
export function getBoardStore(userId: string) {
  let s = stores.get(userId);
  if (!s) stores.set(userId, (s = new BoardStore(userId)));
  return s;
}

/**
 * Ranks the board with your own live points (which include wins the server
 * hasn't scored yet) so it always agrees with the Today screen.
 */
export function rankWithMe(rows: BoardRow[], myPoints: number) {
  const adjusted = rows.map((r) => (r.is_me ? { ...r, points: Math.max(r.points, myPoints) } : r));
  adjusted.sort((a, b) => b.points - a.points || nameOf(a).localeCompare(nameOf(b)));
  let rank = 0;
  return adjusted.map((r, i) => {
    if (i === 0 || r.points !== adjusted[i - 1].points) rank = i + 1;
    return { ...r, rank };
  });
}

export const nameOf = (r: Pick<BoardRow, "display_name" | "username" | "is_me">) =>
  r.is_me ? "You" : (r.display_name?.split(" ")[0] ?? r.username ?? "Rival");

/** "top of the board", "tied with Ada", or "45 pts behind Ada". */
export function gapText(rows: BoardRow[]) {
  const i = rows.findIndex((r) => r.is_me);
  if (i <= 0) return rows.length > 1 && rows[1]?.points === rows[0]?.points ? `tied with ${nameOf(rows[1])}` : "top of the board";
  const ahead = rows[i - 1];
  const gap = ahead.points - rows[i].points;
  return gap === 0 ? `tied with ${nameOf(ahead)}` : `${gap} pts behind ${nameOf(ahead)}`;
}

/** Time until Monday 00:00 local, as "2d 5h 07m". */
export function resetCountdown(now = new Date()) {
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + ((8 - now.getDay()) % 7 || 7));
  const diff = next.getTime() - now.getTime();
  const d = Math.floor(diff / 864e5);
  const h = Math.floor((diff % 864e5) / 36e5);
  const m = String(Math.floor((diff % 36e5) / 6e4)).padStart(2, "0");
  return `${d}d ${h}h ${m}m`;
}
