"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp, useChallenges } from "@/components/app/app-context";
import { Avatar } from "@/components/friends/avatar";
import { challenges, challengeTitle, themFirstName, timeLeft, type Challenge } from "@/lib/challenges";

/** Two players facing off: scores, VS, a progress bar each and the time left (from the design). */
export function ChallengeCard({ c }: { c: Challenge }) {
  const { profile, showToast } = useApp();
  const { refresh } = useChallenges();
  const [busy, setBusy] = useState(false);
  const them = themFirstName(c);
  const goal = c.type === "tasks" ? c.target! : Math.max(c.my_score, c.their_score, 1);
  const bar = (n: number) => `${Math.min(100, (n / goal) * 100)}%`;

  const ends =
    c.status === "finished"
      ? { icon: c.outcome === "won" ? "emoji_events" : c.outcome === "lost" ? "close" : "handshake", text: c.outcome === "won" ? "Won" : c.outcome === "lost" ? "Lost" : "Draw" }
      : c.status === "pending"
        ? { icon: "hourglass_empty", text: c.i_created ? "Waiting" : "Invite" }
        : { icon: "timer", text: timeLeft(c.ends_at) };

  async function act(run: () => Promise<string>, message?: string) {
    setBusy(true);
    try {
      await run();
      if (message) showToast(message, "swords");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={`flex w-[280px] flex-none snap-start flex-col gap-3 rounded-card border bg-surface p-3.5 ${c.outcome === "won" ? "border-[#FFC93D]" : "border-line"}`}
      aria-label={`${challengeTitle(c)} against ${them}`}
    >
      <div className="flex justify-between text-caption font-semibold text-muted">
        <span>{challengeTitle(c)}</span>
        <span className={`flex items-center gap-[3px] ${c.outcome === "won" ? "text-[var(--gold-ink)]" : "text-ink"}`}>
          <span className="material-symbol text-sm" aria-hidden>
            {ends.icon}
          </span>
          {ends.text}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar name={profile.display_name ?? profile.username ?? "You"} accent={profile.accent} size={32} />
          <span className="font-display text-title font-bold tabular-nums" aria-label={`You: ${c.my_score}`}>
            {c.my_score}
          </span>
        </div>
        <span className="font-display text-body-sm font-bold text-accent-text italic">VS</span>
        <div className="flex items-center gap-2">
          <span className="font-display text-title font-bold tabular-nums" aria-label={`${them}: ${c.their_score}`}>
            {c.their_score}
          </span>
          <Avatar name={c.them_name ?? c.them_username ?? them} accent={c.them_accent} size={32} />
        </div>
      </div>
      {c.status === "pending" ? (
        c.i_created ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption text-muted">Waiting for {them} to accept</span>
            <button type="button" disabled={busy} onClick={() => act(() => challenges.cancel(c.id))} className="h-9 rounded-full border border-line px-3 text-caption font-semibold">
              Cancel
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => act(() => challenges.respond(c.id, false))} className="h-10 rounded-full border border-line text-body-sm font-semibold">
              Decline
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => challenges.respond(c.id, true), `You're on. Beat ${them}.`)}
              className="h-10 rounded-full bg-accent text-body-sm font-semibold text-on-accent"
            >
              Accept
            </button>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-[5px]" aria-hidden>
          <div className="h-1.5 overflow-hidden rounded-[3px] bg-surface-2">
            <div className="h-full rounded-[3px] bg-accent transition-[width] duration-300 ease-out" style={{ width: bar(c.my_score) }} />
          </div>
          <div className="h-1.5 overflow-hidden rounded-[3px] bg-surface-2">
            <div className="h-full rounded-[3px] bg-muted" style={{ width: bar(c.their_score) }} />
          </div>
        </div>
      )}
    </article>
  );
}

/** "Challenges" row on the Board: invites first, then live ones, then recent results. */
export function ChallengeCarousel() {
  const { list } = useChallenges();
  return (
    <section aria-labelledby="challenges" className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1 pt-3">
        <h2 id="challenges" className="text-caption font-semibold tracking-[0.06em] text-muted uppercase">
          Challenges
        </h2>
        <Link href="/challenge/new" className="flex h-9 items-center gap-1 rounded-full px-2 text-body-sm font-semibold text-accent-text">
          <span className="material-symbol text-lg" aria-hidden>
            add
          </span>
          New
        </Link>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        {list === null ? (
          <div className="h-[140px] w-[280px] flex-none animate-pulse rounded-card bg-surface" aria-busy="true" />
        ) : (
          list.map((c) => <ChallengeCard key={c.id} c={c} />)
        )}
        <Link
          href="/challenge/new"
          className="flex min-h-[140px] w-[200px] flex-none snap-start flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line text-center"
        >
          <span className="grid size-11 place-items-center rounded-full bg-accent text-on-accent">
            <span className="material-symbol text-2xl" aria-hidden>
              swords
            </span>
          </span>
          <span className="text-body-sm font-semibold">Challenge a friend</span>
          <span className="text-caption text-muted">Winner takes +50</span>
        </Link>
      </div>
    </section>
  );
}
