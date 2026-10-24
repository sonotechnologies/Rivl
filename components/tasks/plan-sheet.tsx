"use client";

import { useEffect, useRef, useState } from "react";
import { useApp, useTasks } from "@/components/app/app-context";
import { CoachBubble } from "@/components/brand/coach-bubble";
import { Sheet } from "@/components/ui/sheet";
import { ai, isAIError, type AIError, type PlanResult } from "@/lib/ai/client";
import { formatTime, todayISO } from "@/lib/dates";
import { Pips } from "./task-bits";

type State = { kind: "loading" } | { kind: "ready"; plan: PlanResult } | { kind: "error"; error: AIError };

/** Plan my day: the AI orders today's tasks into time blocks; "Use this plan" writes the times onto the tasks. */
export function PlanSheet() {
  const { store, closeSheet, showToast, profile } = useApp();
  const { tasks } = useTasks();
  const [state, setState] = useState<State>({ kind: "loading" });
  const asked = useRef(false);

  useEffect(() => {
    // Each plan uses an AI action, so ask exactly once per opening.
    if (asked.current) return;
    asked.current = true;
    void ai.plan().then((r) => setState(isAIError(r) ? { kind: "error", error: r } : { kind: "ready", plan: r }));
  }, []);

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const blocks = state.kind === "ready" ? state.plan.blocks.filter((b) => byId.get(b.taskId) && !byId.get(b.taskId)!.completed_at) : [];

  function apply() {
    const today = todayISO();
    for (const b of blocks) store.updateTask(b.taskId, { due_on: today, due_time: `${b.start}:00` });
    closeSheet();
    showToast("Plan set. Times added to your tasks.", "auto_awesome");
  }

  return (
    <Sheet
      title={
        <span className="flex items-center gap-2">
          <span className="material-symbol text-xl text-accent-text" aria-hidden>
            auto_awesome
          </span>
          Plan my day
        </span>
      }
      onClose={closeSheet}
    >
      {state.kind === "loading" ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Planning your day">
          <p className="text-body-sm text-muted">Lining up your day…</p>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-card bg-bg" />
          ))}
        </div>
      ) : state.kind === "error" ? (
        <div className="flex flex-col gap-4">
          <p className="text-body">{state.error.message}</p>
          <button type="button" data-autofocus onClick={closeSheet} className="h-12 rounded-full border border-line font-semibold">
            Close
          </button>
        </div>
      ) : (
        <>
          <ol className="flex flex-col overflow-hidden rounded-card border border-line bg-bg">
            {blocks.map((b, i) => {
              const t = byId.get(b.taskId)!;
              return (
                <li key={b.taskId} className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t border-line" : ""}`}>
                  <span className="w-[4.5rem] flex-none font-display text-body-sm font-bold tabular-nums">{formatTime(b.start)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium">{t.title}</span>
                    <span className="mt-1 flex items-center gap-2 text-caption text-muted">
                      <Pips difficulty={t.difficulty} />
                      until {formatTime(b.end)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          <CoachBubble coach={profile.coach_style}>{state.plan.tip}</CoachBubble>
          <button type="button" data-autofocus onClick={apply} disabled={!blocks.length} className="h-13 rounded-full bg-accent text-body font-semibold text-on-accent disabled:opacity-50">
            Use this plan
          </button>
          <p className="-mt-2 text-center text-caption text-muted">
            {state.plan.remaining} AI {state.plan.remaining === 1 ? "action" : "actions"} left today
          </p>
        </>
      )}
    </Sheet>
  );
}
