"use client";

import { useApp, useTasks } from "@/components/app/app-context";

/** Quiet status line: offline, syncing, or a rejected write. Renders nothing when all is well. */
export function SyncStatus() {
  const { store } = useApp();
  const { online, pending, error } = useTasks();

  if (error) {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-chip border border-danger/40 bg-danger/10 py-1 pr-1 pl-3 text-body-sm">
        <span className="flex-1">{error}</span>
        <button type="button" onClick={() => store.dismissError()} aria-label="Dismiss" className="grid size-11 place-items-center">
          <span className="material-symbol text-xl">close</span>
        </button>
      </div>
    );
  }
  if (!online) {
    return (
      <p role="status" className="flex items-center gap-2 text-caption font-medium text-muted">
        <span className="material-symbol icon-outline text-base" aria-hidden>
          cloud_off
        </span>
        Offline.{" "}
        {pending ? `${pending} ${pending === 1 ? "change" : "changes"} will sync when you're back.` : "You can still add and tick off tasks."}
      </p>
    );
  }
  if (pending) {
    return (
      <p role="status" className="flex items-center gap-2 text-caption font-medium text-muted">
        <span className="material-symbol text-base motion-safe:animate-spin" aria-hidden>
          sync
        </span>
        Syncing…
      </p>
    );
  }
  return null;
}
