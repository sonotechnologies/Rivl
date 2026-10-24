"use client";

import { useEffect } from "react";
import { useApp, useNudges } from "@/components/app/app-context";

const key = (userId: string) => `rivl-nudged:${userId}`;

/** Toasts the newest unread nudge once, with the sender's avatar shaking (from the brief). */
export function NudgeWatcher() {
  const { profile, showToast } = useApp();
  const { list } = useNudges();

  useEffect(() => {
    const newest = list?.find((n) => !n.seen);
    if (!newest) return;
    let shown: string[] = [];
    try {
      shown = JSON.parse(localStorage.getItem(key(profile.id)) ?? "[]");
    } catch {}
    if (shown.includes(newest.id)) return;
    try {
      localStorage.setItem(key(profile.id), JSON.stringify([...shown, newest.id].slice(-30)));
    } catch {}
    const name = newest.display_name?.split(" ")[0] ?? newest.username ?? "A friend";
    // Browsers block vibration until the page has been tapped.
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8);
    showToast(`${name} nudged you: "${newest.message}"`, undefined, { name: newest.display_name ?? name, accent: newest.accent });
  }, [list, profile.id, showToast]);

  return null;
}
