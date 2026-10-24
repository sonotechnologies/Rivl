"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp, useTasks } from "@/components/app/app-context";
import { Avatar } from "@/components/friends/avatar";
import { NudgeStrip } from "@/components/nudges/nudge-strip";
import { Sheet } from "@/components/ui/sheet";
import { ago, EMOJI, EMOJI_LABELS, feed, PROOF_POINTS, type Emoji, type Post } from "@/lib/feed";

const POLL_MS = 30_000;

/** Friends' shared wins, newest first (from the design). */
export function FeedScreen() {
  const { online } = useTasks();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);

  const withPhotos = useCallback(async (list: Post[]) => {
    const need = list.map((p) => p.photo_path).filter((p): p is string => Boolean(p));
    const urls = await feed.photoUrls(need).catch(() => ({}));
    setPhotos((prev) => ({ ...prev, ...urls }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const first = await feed.page();
      setPosts((prev) => {
        // Keep anything already paged in below the newest 20.
        const older = (prev ?? []).filter((p) => first.length && p.created_at < first[first.length - 1].created_at);
        return [...first, ...older];
      });
      setMore(first.length === 20);
      setError(false);
      void withPhotos(first);
    } catch {
      setError(true);
    }
  }, [withPhotos]);

  useEffect(() => {
    if (!online) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on arrival
    void refresh();
    const t = setInterval(() => document.visibilityState === "visible" && void refresh(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [online, refresh]);

  async function loadMore() {
    if (!posts?.length) return;
    const next = await feed.page(posts[posts.length - 1].created_at);
    setPosts([...posts, ...next]);
    setMore(next.length === 20);
    void withPhotos(next);
  }

  const update = (id: string, patch: Partial<Post>) => setPosts((list) => list?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? null);

  return (
    <div className="grid auto-rows-max grid-cols-[minmax(0,1fr)] gap-3">
      <h1 className="pt-1 font-display text-heading font-bold tracking-[-0.02em]">Feed</h1>
      <NudgeStrip />
      {!online && !posts ? (
        <p className="rounded-card border border-line bg-surface p-4 text-body-sm text-muted">The feed needs a connection. Your tasks still work offline.</p>
      ) : error && !posts ? (
        <p className="rounded-card border border-line bg-surface p-4 text-body-sm text-muted">Couldn&apos;t load the feed. Pull down or come back in a moment.</p>
      ) : posts === null ? (
        [0, 1, 2].map((i) => <div key={i} className="h-[132px] animate-pulse rounded-card border border-line bg-surface" />)
      ) : posts.length === 0 ? (
        <EmptyFeed />
      ) : (
        <>
          {posts.map((p) => (
            <PostCard key={p.id} post={p} photo={p.photo_path ? photos[p.photo_path] : undefined} onChange={(patch) => update(p.id, patch)} onProof={refresh} />
          ))}
          {more ? (
            <button type="button" onClick={loadMore} className="h-11 rounded-full border border-line text-body-sm font-semibold">
              Load more
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function PostCard({ post, photo, onChange, onProof }: { post: Post; photo?: string; onChange: (patch: Partial<Post>) => void; onProof: () => void }) {
  const { profile, showToast } = useApp();
  const [menu, setMenu] = useState(false);
  const name = post.is_me ? "You" : (post.display_name?.split(" ")[0] ?? post.username ?? "A rival");
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function toggle(emoji: Emoji) {
    const on = !post.my_reactions.includes(emoji);
    const count = (post.reactions[emoji] ?? 0) + (on ? 1 : -1);
    // Optimistic: show it straight away, undo if the server says no.
    onChange({ my_reactions: on ? [...post.my_reactions, emoji] : post.my_reactions.filter((e) => e !== emoji), reactions: { ...post.reactions, [emoji]: count } });
    if (on) navigator.vibrate?.(8);
    try {
      await feed.react(post, emoji, profile.id, on);
    } catch {
      onChange({ my_reactions: post.my_reactions, reactions: post.reactions });
      showToast("Couldn't react. Check your connection.", "cloud_off");
    }
  }

  async function addProof(file: File) {
    setUploading(true);
    try {
      await feed.addProof(post.id, profile.id, file);
      showToast(post.verified ? "Photo updated." : `Verified. +${PROOF_POINTS} pts`, "verified");
      onProof();
    } catch (e) {
      showToast(e instanceof Error && e.message.includes("too big") ? e.message : "Couldn't upload the photo. Try again.", "close");
    } finally {
      setUploading(false);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5" aria-label={`${name} completed ${post.title}`}>
      <div className="flex items-center gap-2.5">
        <Avatar name={post.display_name ?? post.username ?? "?"} accent={post.accent} size={36} />
        <div className="flex-1 text-body-sm">
          <span className="font-semibold">{name}</span> completed
        </div>
        <span className="text-caption text-muted">{ago(post.created_at)}</span>
        <button type="button" onClick={() => setMenu(true)} aria-label="Post options" className="-mr-2 grid size-9 place-items-center rounded-full text-muted">
          <span className="material-symbol text-xl" aria-hidden>
            more_horiz
          </span>
        </button>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="flex-1 font-display text-body leading-[1.3] font-semibold">{post.title}</div>
        {post.verified ? (
          <span className="material-symbol text-xl text-accent-text" aria-label="Verified with a photo">
            verified
          </span>
        ) : null}
        <span className={`rounded-full px-2.5 py-1 font-display text-[0.8125rem] font-bold tabular-nums ${post.points_removed ? "bg-surface-2 text-muted line-through" : "bg-accent text-on-accent"}`}>
          +{post.points}
        </span>
      </div>
      {post.points_removed ? (
        <p className="flex items-start gap-2 rounded-chip bg-surface-2 p-2.5 text-caption text-muted">
          <span className="material-symbol mt-px text-base text-danger" aria-hidden>
            flag
          </span>
          {post.is_me ? "Two friends think this one's sus, so its points are on hold. Add photo proof to get them back." : "Points on hold: two friends flagged this as sus."}
        </p>
      ) : null}
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
        <img src={photo} alt={`Photo proof for ${post.title}`} className="h-[180px] w-full rounded-chip object-cover" loading="lazy" />
      ) : post.photo_path ? (
        <div className="h-[180px] animate-pulse rounded-chip bg-surface-2" />
      ) : null}
      {post.is_me && !post.verified ? (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void addProof(f);
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            className="flex h-10 items-center justify-center gap-1.5 rounded-full border border-dashed border-line text-body-sm font-semibold"
          >
            <span className="material-symbol text-lg" aria-hidden>
              add_a_photo
            </span>
            {uploading ? "Uploading…" : `Add photo proof · +${PROOF_POINTS} pts`}
          </button>
        </>
      ) : null}
      <div className="flex gap-1.5" role="group" aria-label="Reactions">
        {EMOJI.map((e) => {
          const on = post.my_reactions.includes(e);
          const n = post.reactions[e] ?? 0;
          return (
            <button
              key={e}
              type="button"
              aria-pressed={on}
              aria-label={`${EMOJI_LABELS[e]}, ${n}`}
              onClick={() => toggle(e)}
              className={`flex h-9 min-w-11 items-center gap-1.5 rounded-full px-3 ${on ? "border-[1.5px] border-accent bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface))] text-accent-text" : "border border-line text-muted"}`}
            >
              <span className="text-base leading-none" aria-hidden>
                {e}
              </span>
              {n ? <span className="text-[0.8125rem] font-semibold tabular-nums">{n}</span> : null}
            </button>
          );
        })}
      </div>

      {menu ? (
        <Sheet title={post.title} onClose={() => setMenu(false)}>
          <div className="flex flex-col overflow-hidden rounded-card border border-line bg-bg">
            {post.is_me ? (
              <button
                type="button"
                data-autofocus
                onClick={() => {
                  setMenu(false);
                  fileInput.current?.click();
                }}
                className="flex h-13 items-center gap-3 px-4 text-left text-[0.9375rem] font-medium"
              >
                <span className="material-symbol text-[1.375rem] text-accent-text" aria-hidden>
                  add_a_photo
                </span>
                {post.verified ? "Replace photo" : `Add photo proof (+${PROOF_POINTS})`}
              </button>
            ) : (
              <button
                type="button"
                data-autofocus
                disabled={post.i_flagged}
                onClick={async () => {
                  setMenu(false);
                  try {
                    const count = await feed.flag(post.id);
                    onChange({ i_flagged: true, flags_count: count });
                    showToast(count >= 2 && !post.verified ? "Flagged. Points on hold until there's proof." : "Flagged. One more and the points go on hold.", "flag");
                  } catch {
                    showToast("Couldn't flag that one.", "close");
                  }
                }}
                className="flex h-13 items-center gap-3 px-4 text-left text-[0.9375rem] font-medium disabled:text-muted"
              >
                <span className="material-symbol icon-outline text-[1.375rem] text-danger" aria-hidden>
                  flag
                </span>
                {post.i_flagged ? "You flagged this" : "Looks sus"}
              </button>
            )}
          </div>
          {!post.is_me ? (
            <p className="text-caption text-muted">Two sus flags put the points on hold until {name} adds a photo. Flags are anonymous.</p>
          ) : null}
        </Sheet>
      ) : null}
    </article>
  );
}

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line px-4 py-8 text-center">
      <span className="grid size-18 place-items-center rounded-full border-2 border-line text-muted">
        <span className="material-symbol icon-outline text-[2.5rem]" aria-hidden>
          dynamic_feed
        </span>
      </span>
      <p className="font-display text-title font-bold">No wins yet</p>
      <p className="max-w-[280px] text-body-sm text-pretty text-muted">
        Finish a shared task and it shows up here for your friends. Turn on &ldquo;Share wins by default&rdquo; in Settings to share everything.
      </p>
    </div>
  );
}
