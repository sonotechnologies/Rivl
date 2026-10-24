"use client";

import Link from "next/link";
import { useBoard } from "@/components/app/app-context";
import { gapText } from "@/lib/board";

/** "#3 this week · 45 pts behind Ada", pinned above the nav on Today. Taps through to the board. */
export function RankStrip() {
  const { rows, moved } = useBoard();
  const me = rows?.find((r) => r.is_me);
  if (!rows || rows.length < 2 || !me) return null;
  const move = moved[me.id];

  return (
    <>
      {/* Keeps the last task clear of the strip. */}
      <div className="h-14" aria-hidden />
      <Link
        href="/board"
        className="fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-10 mx-auto flex min-h-12 w-[calc(100%-32px)] max-w-[448px] items-center gap-2.5 rounded-full border border-line bg-surface-2 pr-2.5 pl-4 shadow-[0_-12px_24px_var(--bg)] lg:left-[calc(50%-424px)] lg:right-auto lg:mx-0"
      >
        <span className="font-display text-lg font-bold text-accent-text tabular-nums">#{me.rank}</span>
        <span className="flex-1 truncate text-body-sm font-medium">this week · {gapText(rows)}</span>
        {move ? (
          <span className={`flex items-center gap-0.5 text-caption font-semibold ${move === "up" ? "text-success" : "text-danger"}`}>
            <span className="material-symbol text-base" aria-hidden>
              {move === "up" ? "arrow_upward" : "arrow_downward"}
            </span>
            {move === "up" ? "Up" : "Down"}
          </span>
        ) : null}
        <span className="material-symbol text-[1.375rem] text-muted" aria-hidden>
          chevron_right
        </span>
      </Link>
    </>
  );
}
