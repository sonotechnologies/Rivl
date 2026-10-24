"use client";

import { createClient } from "@/lib/supabase/client";

// Browser side of the feed (supabase/migrations/20261024700000_feed.sql).

export const EMOJI = ["🔥", "👏", "😂", "💪"] as const;
export type Emoji = (typeof EMOJI)[number];
export const EMOJI_LABELS: Record<Emoji, string> = { "🔥": "Fire", "👏": "Clap", "😂": "Funny", "💪": "Strong" };

export const PROOF_POINTS = 10;
const BUCKET = "proofs";
const MAX_BYTES = 1024 * 1024;
const MAX_SIDE = 1280;

export type Post = {
  id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  accent: string;
  is_me: boolean;
  title: string;
  points: number;
  photo_path: string | null;
  verified: boolean;
  points_removed: boolean;
  flags_count: number;
  i_flagged: boolean;
  created_at: string;
  reactions: Partial<Record<Emoji, number>>;
  my_reactions: Emoji[];
};

const db = () => createClient();

/** "now", "12m", "3h", "2d". */
export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export const feed = {
  async page(before?: string) {
    const { data, error } = await db().rpc("my_feed", before ? { p_before: before } : {});
    if (error) throw error;
    return data as Post[];
  },

  async react(post: Post, emoji: Emoji, userId: string, on: boolean) {
    const reactions = db().from("reactions");
    const { error } = on
      ? await reactions.insert({ post_id: post.id, user_id: userId, emoji })
      : await reactions.delete().eq("post_id", post.id).eq("user_id", userId).eq("emoji", emoji);
    if (error && error.code !== "23505") throw error;
  },

  async flag(postId: string) {
    const { data, error } = await db().rpc("flag_post", { p_post: postId });
    if (error) throw error;
    return data as number;
  },

  /** Short-lived links for the photos on screen (the bucket is private). */
  async photoUrls(paths: string[]) {
    if (!paths.length) return {};
    const { data } = await db().storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
    return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  },

  /** Compresses, uploads and attaches photo proof to one of your posts. */
  async addProof(postId: string, userId: string, file: File) {
    const blob = await compress(file);
    const path = `${userId}/${postId}.webp`;
    const { error: uploadError } = await db().storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: true });
    if (uploadError) throw uploadError;
    const { data, error } = await db().rpc("attach_proof", { p_post: postId, p_path: path });
    if (error) throw error;
    return data as string;
  },

  /** Your post for a finished, shared task (to add proof from the task screen). */
  async postForTask(taskId: string) {
    const { data } = await db().from("feed_posts").select("id, verified").eq("task_id", taskId).maybeSingle();
    return data as { id: string; verified: boolean } | null;
  },
};

/** Shrinks a photo to at most 1280 px on the long side, as WebP under 1 MB. */
export async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.8, 0.65, 0.5, 0.35]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    // Older Safari can't encode WebP and hands back PNG; fall back to JPEG there.
    const out = blob && blob.type === "image/webp" ? blob : await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (out && out.size <= MAX_BYTES) return out;
  }
  throw new Error("That photo is too big, even after shrinking. Try another.");
}
