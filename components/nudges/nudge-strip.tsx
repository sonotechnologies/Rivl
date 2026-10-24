"use client";

import { useEffect } from "react";
import { useApp, useNudges } from "@/components/app/app-context";
import { Avatar } from "@/components/friends/avatar";

/** Nudges you've received, as a strip at the top of the feed (from the design). */
export function NudgeStrip() {
  const { openNudge } = useApp();
  const { list, unseen, markSeen } = useNudges();

  // Seeing the strip counts as reading them.
  useEffect(() => {
    if (!unseen) return;
    const t = setTimeout(() => void markSeen(), 1500);
    return () => clearTimeout(t);
  }, [unseen, markSeen]);

  if (!list?.length) return null;
  return (
    <section aria-label="Nudges" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
      <ul className="flex w-max gap-2">
        {list.slice(0, 10).map((n) => {
          const name = n.display_name?.split(" ")[0] ?? n.username ?? "A friend";
          return (
            <li
              key={n.id}
              className={`flex max-w-[300px] items-center gap-2.5 rounded-full bg-surface py-1.5 pr-1.5 pl-1.5 ${n.seen ? "border border-line" : "border-[1.5px] border-accent"}`}
            >
              <Avatar name={n.display_name ?? n.username ?? "?"} accent={n.accent} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.8125rem] font-semibold">{name} nudged you</div>
                <div className="truncate text-caption text-muted">{n.message}</div>
              </div>
              <button
                type="button"
                onClick={() => openNudge(n.from_id)}
                className="h-9 flex-none rounded-full bg-accent px-3 text-caption font-semibold text-on-accent"
              >
                Nudge back
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
