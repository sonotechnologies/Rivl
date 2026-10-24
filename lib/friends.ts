"use client";

import { createClient } from "@/lib/supabase/client";

// Browser side of the friends functions in supabase/migrations/20261024400000_friends.sql.

export type Relation = "none" | "friends" | "incoming" | "outgoing" | "blocked";

export type Person = { id: string; display_name: string | null; username: string | null; accent: string };
export type Friend = Person & { streak_count: number; streak_last_on: string | null; since: string | null };
export type FoundPerson = Person & { relation: Relation };
export type Request = Person & { friendship_id: string; direction: "incoming" | "outgoing" | "blocked"; created_at: string };

const db = () => createClient();

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const friends = {
  inviteCode: () => rpc<string>("my_invite_code"),
  list: () => rpc<Friend[]>("my_friends"),
  requests: () => rpc<Request[]>("my_friend_requests"),
  search: (q: string) => rpc<FoundPerson[]>("search_profiles", { p_query: q }),
  request: (id: string) => rpc<string>("send_friend_request", { p_other: id }),
  respond: (friendshipId: string, accept: boolean) => rpc<string>("respond_friend_request", { p_friendship: friendshipId, p_accept: accept }),
  remove: (id: string) => rpc<string>("remove_friend", { p_other: id }),
  block: (id: string) => rpc<string>("block_user", { p_other: id }),
  report: (id: string, reason: string) => rpc<string>("report_user", { p_other: id, p_reason: reason }),
};

export const inviteUrl = (code: string) => `${window.location.origin}/invite/${code}`;

export const inviteMessage = (url: string) =>
  `I'm on Rivl, the to-do app where we compete for points every week. Join me and we both get +100: ${url}`;

export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
