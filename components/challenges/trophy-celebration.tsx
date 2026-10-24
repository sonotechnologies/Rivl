"use client";

import { useEffect, useState } from "react";
import { useApp, useChallenges } from "@/components/app/app-context";
import { challengeTitle, themFirstName, WIN_POINTS, type Challenge } from "@/lib/challenges";

const seenKey = (userId: string) => `rivl:${userId}:wins-seen`;
const readSeen = (userId: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(seenKey(userId)) ?? "[]");
  } catch {
    return [];
  }
};

/** Full-screen trophy for a challenge you've won (from the design). Tap to continue. */
export function TrophyCelebration() {
  const { profile } = useApp();
  const { list } = useChallenges();
  const [shown, setShown] = useState<Challenge | null>(null);

  useEffect(() => {
    if (!list || shown) return;
    const seen = readSeen(profile.id);
    const win = list.find((c) => c.outcome === "won" && !seen.includes(c.id));
    if (!win) return;
    try {
      localStorage.setItem(seenKey(profile.id), JSON.stringify([...seen, win.id].slice(-50)));
    } catch {}
    navigator.vibrate?.([30, 60, 30, 60, 60]);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a win arrived from the server
    setShown(win);
  }, [list, shown, profile.id]);

  if (!shown) return null;
  return (
    <button
      type="button"
      onClick={() => setShown(null)}
      aria-label={`Challenge won. You beat ${themFirstName(shown)}. Tap to continue.`}
      className="fixed inset-0 z-50 flex animate-fade-in flex-col items-center justify-center gap-3 bg-[color-mix(in_oklab,var(--bg)_94%,transparent)] p-6 text-center"
    >
      <span className="grid size-[200px] animate-trophy-in place-items-center rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,#FFC93D_30%,transparent),transparent_68%)]">
        <span className="material-symbol text-[7.5rem] text-[#FFC93D]" aria-hidden>
          emoji_events
        </span>
      </span>
      <span className="text-[0.8125rem] font-semibold tracking-[0.08em] text-muted uppercase">Challenge won</span>
      <span className="font-display text-hero leading-[1.05] font-bold tracking-[-0.02em]">You beat {themFirstName(shown)}</span>
      <span className="text-body text-muted">
        {challengeTitle(shown)} · {shown.my_score}–{shown.their_score}
      </span>
      <span className="mt-2 rounded-full bg-accent px-4 py-1.5 font-display text-title font-bold text-on-accent">+{WIN_POINTS} pts</span>
      <span className="mt-7 text-[0.8125rem] font-medium text-muted">Tap to continue</span>
    </button>
  );
}
