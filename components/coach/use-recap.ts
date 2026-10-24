"use client";

import { useEffect, useState } from "react";
import { ai, isAIError } from "@/lib/ai/client";
import { todayISO } from "@/lib/dates";

/** From 6 pm the coach sums up the day (once; the server keeps it). */
export const RECAP_HOUR = 18;

const key = (userId: string, day: string) => `rivl-recap:${userId}:${day}`;

/** Today's AI recap after 6 pm, or null (before then, offline, or if the AI is down). */
export function useRecap(userId: string, online: boolean) {
  const [recap, setRecap] = useState<string | null>(null);

  useEffect(() => {
    const day = todayISO();
    if (new Date().getHours() < RECAP_HOUR) return;
    try {
      const cached = localStorage.getItem(key(userId, day));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- device cache, read after mount
      if (cached) return setRecap(cached);
    } catch {}
    if (!online) return;
    let live = true;
    void ai.recap().then((r) => {
      if (!live || isAIError(r)) return;
      setRecap(r.message);
      try {
        localStorage.setItem(key(userId, day), r.message);
      } catch {}
    });
    return () => {
      live = false;
    };
  }, [userId, online]);

  return recap;
}
