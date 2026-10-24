"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/** Bottom sheet: dims the page, slides up, closes on backdrop tap or Escape. */
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    // Focus the first field, or the panel itself.
    const first = panel.current?.querySelector<HTMLElement>("input, textarea, [data-autofocus]");
    (first ?? panel.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30">
      <div className="absolute inset-0 animate-fade-in bg-[rgba(5,5,8,.6)]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] w-full max-w-[480px] animate-sheet-up flex-col gap-4 overflow-y-auto rounded-t-sheet border-t border-line bg-surface px-4 pt-2 pb-[max(28px,env(safe-area-inset-bottom))] outline-none"
      >
        <div className="h-1 w-10 flex-none self-center rounded-full bg-line" aria-hidden />
        <div id={titleId} className="font-display text-title font-bold">
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}
