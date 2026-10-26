"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp, useFocus } from "@/components/app/app-context";
import { remainingMs } from "@/lib/focus";

/** While a session runs elsewhere in the app: a small timer above the nav. Celebrates if it ends off-screen. */
export function FocusPill() {
  const { showToast, store: tasks } = useApp();
  const { running, finished, store } = useFocus();
  const pathname = usePathname();
  const onFocus = pathname === "/focus";
  // Today pins its rank strip just above the nav; sit above that.
  const raised = pathname === "/today";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || onFocus) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running, onFocus]);

  useEffect(() => {
    if (finished) void tasks.sync();
    if (!finished || onFocus) return;
    showToast(
      finished.points
        ? `+${finished.points} Focus session done`
        : "Focus session done",
      "timer",
    );
    store.clearFinished();
  }, [finished, onFocus, showToast, store, tasks]);

  if (!running || onFocus) return null;
  const s = Math.ceil(remainingMs(running, now) / 1000);
  return (
    <>
      {/* Room at the end of the page so the pill never covers the last row. */}
      <div className="h-14" aria-hidden />
      <Link
        href="/focus"
        className={`fixed right-4 ${raised ? "bottom-[calc(152px+env(safe-area-inset-bottom))]" : "bottom-[calc(96px+env(safe-area-inset-bottom))]"} z-10 flex h-11 animate-fade-in items-center gap-1.5 rounded-full border-[1.5px] border-accent bg-surface-2 px-4 font-display text-body font-bold tabular-nums shadow-[0_8px_24px_rgba(0,0,0,.3)] lg:right-[calc(50%-40px)]`}
        aria-label="Focus session running, open timer"
      >
        <span className="material-symbol text-xl text-accent-text" aria-hidden>
          timer
        </span>
        {String(Math.floor(s / 60)).padStart(2, "0")}:
        {String(s % 60).padStart(2, "0")}
      </Link>
    </>
  );
}
