"use client";

import { useEffect, useState } from "react";
import { useApp, useBoard } from "@/components/app/app-context";
import { enablePush, pushState } from "@/lib/push/client";

const KEY = "rivl-push-prompt-dismissed";

/** A one-time card on Today once you have friends: turn on push so nudges and challenges reach you. */
export function PushPrompt() {
  const { showToast } = useApp();
  const { rows } = useBoard();
  const [show, setShow] = useState(false);
  const hasFriends = (rows?.length ?? 0) > 1;

  useEffect(() => {
    if (!hasFriends) return;
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {}
    void pushState().then((s) => setShow(s === "off"));
  }, [hasFriends]);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  };

  if (!show) return null;
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3.5">
      <span className="grid size-10 flex-none place-items-center rounded-full bg-[color-mix(in_oklab,var(--accent)_18%,var(--surface))] text-accent-text">
        <span className="material-symbol text-xl" aria-hidden>
          notifications
        </span>
      </span>
      <div className="flex-1">
        <p className="text-body-sm font-semibold">Know when they make a move</p>
        <p className="text-caption text-muted">Nudges, challenges and your streak. Max 5 a day.</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          const s = await enablePush().catch(() => "off" as const);
          dismiss();
          showToast(s === "on" ? "Notifications on." : s === "denied" ? "Blocked. You can allow them in your phone settings." : "No problem. Turn them on in Settings any time.", s === "on" ? "notifications" : undefined);
        }}
        className="h-9 flex-none rounded-full bg-accent px-3.5 text-caption font-semibold text-on-accent"
      >
        Turn on
      </button>
      <button type="button" onClick={dismiss} aria-label="Not now" className="-mr-1.5 grid size-9 flex-none place-items-center rounded-full text-muted">
        <span className="material-symbol text-xl" aria-hidden>
          close
        </span>
      </button>
    </div>
  );
}
