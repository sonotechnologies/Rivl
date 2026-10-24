"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Browser side of the challenge functions in supabase/migrations/20261024600000_challenges.sql.

export type ChallengeType = "points" | "tasks";

export type Challenge = {
  id: string;
  type: ChallengeType;
  target: number | null;
  status: "pending" | "active" | "finished";
  starts_at: string | null;
  ends_at: string;
  finished_at: string | null;
  i_created: boolean;
  outcome: "won" | "lost" | "draw" | null;
  my_score: number;
  their_score: number;
  them_id: string;
  them_name: string | null;
  them_username: string | null;
  them_accent: string;
};

export const WIN_POINTS = 50;

export const challengeTitle = (c: Pick<Challenge, "type" | "target">) => (c.type === "tasks" ? `First to ${c.target} tasks` : "Most points");

export const themFirstName = (c: Pick<Challenge, "them_name" | "them_username">) => c.them_name?.split(" ")[0] ?? c.them_username ?? "Rival";

/** "45m left", "6h left", "2d left". */
export function timeLeft(endsAt: string, now = Date.now()) {
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return "Ending";
  if (ms < 36e5) return `${Math.max(1, Math.round(ms / 6e4))}m left`;
  if (ms < 864e5) return `${Math.round(ms / 36e5)}h left`;
  return `${Math.round(ms / 864e5)}d left`;
}

const db = () => createClient();

export const challenges = {
  create: async (opponent: string, type: ChallengeType, target: number | null, endsAt: Date) => {
    const { data, error } = await db().rpc("create_challenge", {
      p_opponent: opponent,
      p_type: type,
      p_target: target,
      p_ends_at: endsAt.toISOString(),
    });
    if (error) throw new Error(error.message);
    return data as string;
  },
  respond: async (id: string, accept: boolean) => (await db().rpc("respond_challenge", { p_id: id, p_accept: accept })).data as string,
  cancel: async (id: string) => (await db().rpc("cancel_challenge", { p_id: id })).data as string,
};

/** Live list of your challenges: Realtime on challenges and points, with 30-second polling as a fallback. */
class ChallengeStore {
  private view: { list: Challenge[] | null } = { list: null };
  private listeners = new Set<() => void>();
  private channel: RealtimeChannel | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private debounce: ReturnType<typeof setTimeout> | undefined;
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
    this.timer = setInterval(() => document.visibilityState === "visible" && void this.refresh(), 30_000);
    document.addEventListener("visibilitychange", this.onVisible);
    const soon = () => {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => void this.refresh(), 500);
    };
    this.channel = this.supabase
      .channel(`challenges:${this.userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "challenges" }, soon)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "point_events" }, soon)
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

  async refresh() {
    if (!navigator.onLine) return;
    const { data, error } = await this.supabase.rpc("my_challenges");
    if (error) return;
    this.view = { list: data as Challenge[] };
    this.listeners.forEach((fn) => fn());
  }
}

const stores = new Map<string, ChallengeStore>();
export function getChallengeStore(userId: string) {
  let s = stores.get(userId);
  if (!s) stores.set(userId, (s = new ChallengeStore(userId)));
  return s;
}
