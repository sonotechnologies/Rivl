"use client";

import { useEffect, useState } from "react";
import { BADGES } from "@/lib/badges";
import { useApp, useTasks } from "./app-context";

const seenKey = (userId: string) => `rivl:${userId}:badges-seen`;

function readSeen(userId: string): string[] | null {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSeen(userId: string, ids: string[]) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify(ids));
  } catch {}
}

/** Full-screen "Badge earned" moment for badges this device hasn't celebrated yet. */
export function BadgeCelebration() {
  const { profile, showToast } = useApp();
  const { stats } = useTasks();
  const [queue, setQueue] = useState<string[]>([]);

  useEffect(() => {
    if (!stats) return;
    const seen = readSeen(profile.id);
    if (seen === null) {
      // First visit on this device: don't replay badges earned elsewhere.
      writeSeen(profile.id, stats.badges);
      return;
    }
    const fresh = stats.badges.filter((b) => !seen.includes(b));
    if (!fresh.length) return;
    writeSeen(profile.id, [...seen, ...fresh]);
    navigator.vibrate?.([20, 40, 20]);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- new badges arrive from the server
    setQueue((q) => [...q, ...fresh]);
  }, [stats, profile.id]);

  const badge = BADGES.find((b) => b.id === queue[0]);
  if (!badge) return null;

  const dismiss = () => {
    setQueue((q) => q.slice(1));
    showToast(`Badge earned: ${badge.name}. It's on your profile.`, badge.icon);
  };

  return (
    <button
      type="button"
      onClick={dismiss}
      aria-label={`Badge earned: ${badge.name}. ${badge.description}. Tap to continue.`}
      className="fixed inset-0 z-50 flex animate-fade-in flex-col items-center justify-center gap-3 bg-[color-mix(in_oklab,var(--bg)_94%,transparent)] p-6 text-center"
    >
      <span className="grid size-[136px] animate-flip-in place-items-center rounded-full bg-accent text-on-accent shadow-[0_0_48px_8px_var(--accent-glow)]">
        <span className="material-symbol text-[4.25rem]" aria-hidden>
          {badge.icon}
        </span>
      </span>
      <span className="mt-3 text-[0.8125rem] font-semibold tracking-[0.08em] text-muted uppercase">Badge earned</span>
      <span className="font-display text-hero leading-[1.05] font-bold tracking-[-0.02em]">{badge.name}</span>
      <span className="text-body text-muted">{badge.description}</span>
      <span className="mt-7 text-[0.8125rem] font-medium text-muted">Tap to continue</span>
    </button>
  );
}
