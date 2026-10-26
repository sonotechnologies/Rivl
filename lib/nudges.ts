"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { sendDuePushes } from "@/lib/push/client";
import { createClient } from "@/lib/supabase/client";

// Browser side of nudges (supabase/migrations/20261024800000_coach.sql).

/** Ready-made lines from the design; the AI can write one in your coach's voice instead. */
export const NUDGE_PRESETS = ["Your move.", "I'm coming for your spot.", "Two days left. Tick tock.", "Still on that one task?"];
export const NUDGES_PER_DAY = 3;

export type Nudge = {
  id: string;
  from_id: string;
  display_name: string | null;
  username: string | null;
  accent: string;
  message: string;
  seen: boolean;
  created_at: string;
};

const db = () => createClient();

export const nudges = {
  /** Returns how many more you can send this friend today. */
  async send(to: string, message: string) {
    const { data, error } = await db().rpc("send_nudge", { p_to: to, p_message: message });
    if (error) throw new Error(error.message.includes("limit") ? "limit" : error.message.includes("not_friends") ? "not_friends" : "failed");
    sendDuePushes();
    return data as number;
  },
  async left(to: string) {
    const { data, error } = await db().rpc("nudges_left", { p_to: to });
    return error ? NUDGES_PER_DAY : (data as number);
  },
};

export type NudgeView = { list: Nudge[] | null; unseen: number };

/** Nudges you've received: Realtime on new ones, polling every minute as a fallback. */
class NudgeStore {
  private view: NudgeView = { list: null, unseen: 0 };
  private listeners = new Set<() => void>();
  private channel: RealtimeChannel | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private client: ReturnType<typeof createClient> | undefined;
  private get supabase() {
    return (this.client ??= createClient());
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

  private start() {
    void this.refresh();
    this.timer = setInterval(() => document.visibilityState === "visible" && void this.refresh(), 60_000);
    document.addEventListener("visibilitychange", this.onVisible);
    this.channel = this.supabase
      .channel(`nudges:${this.userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "nudges", filter: `to_id=eq.${this.userId}` }, () => void this.refresh())
      .subscribe();
  }
  private stop() {
    clearInterval(this.timer);
    document.removeEventListener("visibilitychange", this.onVisible);
    if (this.channel) void this.supabase.removeChannel(this.channel);
    this.channel = null;
  }
  private onVisible = () => {
    if (document.visibilityState === "visible") void this.refresh();
  };
  private set(list: Nudge[]) {
    this.view = { list, unseen: list.filter((n) => !n.seen).length };
    this.listeners.forEach((fn) => fn());
  }

  async refresh() {
    if (!navigator.onLine) return;
    const { data, error } = await this.supabase.rpc("my_nudges");
    if (!error) this.set(data as Nudge[]);
  }

  /** Called when the feed strip is on screen. */
  async markSeen() {
    if (!this.view.unseen) return;
    this.set((this.view.list ?? []).map((n) => ({ ...n, seen: true })));
    await this.supabase.rpc("mark_nudges_seen");
  }
}

const stores = new Map<string, NudgeStore>();
export function getNudgeStore(userId: string) {
  let s = stores.get(userId);
  if (!s) stores.set(userId, (s = new NudgeStore(userId)));
  return s;
}
