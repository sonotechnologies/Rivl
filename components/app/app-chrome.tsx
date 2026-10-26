"use client";

import { TrophyCelebration } from "@/components/challenges/trophy-celebration";
import { Avatar } from "@/components/friends/avatar";
import { NudgeSheet } from "@/components/nudges/nudge-sheet";
import { NudgeWatcher } from "@/components/nudges/nudge-watcher";
import { PushSync } from "@/components/push/push-sync";
import { PlanSheet } from "@/components/tasks/plan-sheet";
import { QuickAddSheet } from "@/components/tasks/quick-add-sheet";
import { TaskOptionsSheet } from "@/components/tasks/task-options-sheet";
import { useApp } from "./app-context";
import { BadgeCelebration } from "./badge-celebration";
import { BottomNav } from "./bottom-nav";

/** Everything that floats over the signed-in screens: nav, toast and bottom sheets. */
export function AppChrome() {
  const { sheet, openQuickAdd, toast } = useApp();
  return (
    <>
      <BottomNav onAdd={openQuickAdd} />
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-40 mx-auto w-full max-w-[480px] px-4 lg:left-[calc(50%-440px)] lg:right-auto lg:mx-0 lg:px-0">
          <div
            key={toast.id}
            role="status"
            className="flex min-h-11 animate-toast-in items-center gap-2.5 rounded-full border border-line bg-surface-2 py-2 pr-4 pl-2 shadow-[0_12px_32px_rgba(0,0,0,.35)]"
          >
            {toast.who ? (
              <span className="flex-none animate-shake">
                <Avatar name={toast.who.name} accent={toast.who.accent} size={32} />
              </span>
            ) : toast.icon ? (
              <span className="grid size-8 flex-none place-items-center rounded-full bg-[color-mix(in_oklab,var(--accent)_18%,var(--surface))] text-accent-text">
                <span className="material-symbol text-lg" aria-hidden>
                  {toast.icon}
                </span>
              </span>
            ) : null}
            <span className="flex-1 text-body-sm leading-[1.3] font-medium">{toast.text}</span>
          </div>
        </div>
      ) : null}
      {sheet?.kind === "add" ? <QuickAddSheet /> : null}
      {sheet?.kind === "options" ? <TaskOptionsSheet taskId={sheet.taskId} /> : null}
      {sheet?.kind === "plan" ? <PlanSheet /> : null}
      {sheet?.kind === "nudge" ? <NudgeSheet friendId={sheet.friendId} /> : null}
      <NudgeWatcher />
      <PushSync />
      <TrophyCelebration />
      <BadgeCelebration />
    </>
  );
}
