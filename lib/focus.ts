"use client";

import { createClient } from "@/lib/supabase/client";

// Browser side of the focus timer (supabase/migrations/20261025000000_focus_recap.sql).
// The server's start time is the one that counts; the phone only counts down.

export const FOCUS_MINUTES = 25;
export const FOCUS_MS = FOCUS_MINUTES * 60_000;
export const FOCUS_POINTS = 5;
export const FOCUS_PER_DAY = 8;

/** `skew` is how far the server's clock is ahead of this phone's, in ms. */
export type Running = { id: string; taskId: string | null; startedAt: string; skew: number };
export type FocusView = {
  loaded: boolean;
  running: Running | null;
  today: number;
  /** Set when a session just paid out, until the UI has celebrated it. */
  finished: { points: number; today: number; taskId: string | null } | null;
  error: string | null;
};

const KEY = (userId: string) => `rivl-focus:${userId}`;

export const remainingMs = (r: Running, now = Date.now()) => Math.max(0, new Date(r.startedAt).getTime() + FOCUS_MS - (now + (r.skew ?? 0)));
const skewFrom = (serverNow: string | null) => (serverNow ? new Date(serverNow).getTime() - Date.now() : 0);

/** Keeps the running session, ticks every second, and claims the points the moment time is up. */
class FocusStore {
  private view: FocusView = { loaded: false, running: null, today: 0, finished: null, error: null };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private finishing = false;
  private client: ReturnType<typeof createClient> | undefined;
  private get db() {
    return (this.client ??= createClient());
  }

  constructor(private userId: string) {
    try {
      const saved = localStorage.getItem(KEY(userId));
      if (saved) this.view = { ...this.view, running: JSON.parse(saved) };
    } catch {}
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    if (this.listeners.size === 1) {
      void this.refresh();
      this.schedule();
    }
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) clearTimeout(this.timer);
    };
  };
  getView = () => this.view;

  private set(patch: Partial<FocusView>) {
    this.view = { ...this.view, ...patch };
    if ("running" in patch) {
      try {
        if (patch.running) localStorage.setItem(KEY(this.userId), JSON.stringify(patch.running));
        else localStorage.removeItem(KEY(this.userId));
      } catch {}
    }
    this.listeners.forEach((fn) => fn());
    this.schedule();
  }

  /** Wakes up when the session ends (timers drift in background tabs, so it re-checks on return). */
  private schedule() {
    clearTimeout(this.timer);
    const r = this.view.running;
    if (!r) return;
    const left = remainingMs(r);
    if (left === 0) void this.finish();
    else this.timer = setTimeout(() => this.schedule(), Math.min(left, 60_000));
  }

  async refresh() {
    if (!navigator.onLine) return this.set({ loaded: true });
    const { data, error } = await this.db.rpc("my_focus");
    if (error) return this.set({ loaded: true });
    const row = (data as { id: string | null; task_id: string | null; started_at: string | null; sessions_today: number; server_now: string | null }[])[0];
    this.set({
      loaded: true,
      today: row?.sessions_today ?? 0,
      running: row?.id ? { id: row.id, taskId: row.task_id, startedAt: row.started_at!, skew: skewFrom(row.server_now) } : null,
    });
  }

  async start(taskId: string | null) {
    const { data, error } = await this.db.rpc("start_focus", { p_task: taskId });
    if (error) return this.set({ error: navigator.onLine ? "Couldn't start. Try again." : "Focus needs a connection to start." });
    const row = (data as { id: string; started_at: string; server_now: string }[])[0];
    this.set({ running: { id: row.id, taskId, startedAt: row.started_at, skew: skewFrom(row.server_now) }, finished: null, error: null });
  }

  async finish() {
    const r = this.view.running;
    if (!r || this.finishing) return;
    if (!navigator.onLine) {
      // Claim it once we're back online.
      window.addEventListener("online", () => void this.finish(), { once: true });
      return;
    }
    this.finishing = true;
    const { data, error } = await this.db.rpc("finish_focus", { p_id: r.id });
    this.finishing = false;
    if (error) {
      // Ended elsewhere (another device or tab): just resync.
      if (/not_running/.test(error.message)) return this.refresh();
      // Too soon by the server's clock, or a blip: try again shortly.
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.finish(), 5_000);
      return;
    }
    const row = (data as { points: number; sessions_today: number }[])[0];
    this.set({ running: null, today: row.sessions_today, finished: { points: row.points, today: row.sessions_today, taskId: r.taskId } });
  }

  async cancel() {
    const r = this.view.running;
    if (!r) return;
    this.set({ running: null });
    await this.db.rpc("cancel_focus", { p_id: r.id });
  }

  /** The UI has shown the win. */
  clearFinished() {
    if (this.view.finished) this.set({ finished: null });
  }
}

const stores = new Map<string, FocusStore>();
export function getFocusStore(userId: string) {
  let s = stores.get(userId);
  if (!s) stores.set(userId, (s = new FocusStore(userId)));
  return s;
}
