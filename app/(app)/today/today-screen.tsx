"use client";

import { useState } from "react";
import { useApp, useTasks } from "@/components/app/app-context";
import { CoachBubble } from "@/components/brand/coach-bubble";
import { SyncStatus } from "@/components/tasks/sync-status";
import { DoneRow, TaskRow } from "@/components/tasks/task-row";
import { coachLine, type CoachMoment } from "@/lib/coach-lines";
import { formatDay, greeting, toISODate, todayISO, weekStartISO } from "@/lib/dates";
import { displayStreak, pointTotals, type StreakState } from "@/lib/tasks/points";
import type { Subtask, Task } from "@/lib/tasks/types";

const sectionLabel = "px-1 pt-1 text-caption font-semibold tracking-[0.06em] uppercase";

const byTimeThenCreated = (a: Task, b: Task) =>
  (a.due_time ?? "99").localeCompare(b.due_time ?? "99") || a.created_at.localeCompare(b.created_at);

function countSubtasks(subtasks: Subtask[]) {
  const counts = new Map<string, { done: number; total: number }>();
  for (const s of subtasks) {
    const c = counts.get(s.task_id) ?? { done: 0, total: 0 };
    c.total++;
    if (s.done) c.done++;
    counts.set(s.task_id, c);
  }
  return counts;
}

export function TodayScreen() {
  const { profile, openQuickAdd, openPlan, completing } = useApp();
  const view = useTasks();
  const [doneOpen, setDoneOpen] = useState(false);
  const [upcomingOpen, setUpcomingOpen] = useState(false);

  if (!view.loaded) return <TodaySkeleton />;

  const today = todayISO();
  const weekStart = weekStartISO(today);
  const completedOn = (t: Task) => (t.completed_at ? toISODate(new Date(t.completed_at)) : null);

  const open = view.tasks.filter((t) => !t.completed_at);
  const overdue = open.filter((t) => t.due_on && t.due_on < today).sort((a, b) => a.due_on!.localeCompare(b.due_on!));
  const dueToday = open.filter((t) => t.due_on === today).sort(byTimeThenCreated);
  const upcoming = open
    .filter((t) => !t.due_on || t.due_on > today)
    .sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || byTimeThenCreated(a, b));
  const doneToday = view.tasks
    .filter((t) => completedOn(t) === today)
    .sort((a, b) => b.completed_at!.localeCompare(a.completed_at!));

  const { todayPts: todayPoints, weekPts: weekPoints } = pointTotals(view.stats, view.tasks, today, weekStart);
  const streak = displayStreak(view.stats, doneToday.length > 0, today);
  const goal = view.stats?.weekly_goal ?? profile.weekly_goal;

  const subtaskCounts = countSubtasks(view.subtasks);
  const counts = (id: string) => subtaskCounts.get(id) ?? { done: 0, total: 0 };

  const nowOpen = overdue.length + dueToday.length;
  const moment: CoachMoment =
    view.tasks.length === 0 ? "empty" : nowOpen === 0 ? "clear" : doneToday.length > 0 ? "progress" : "start";
  const name = profile.display_name?.split(" ")[0] ?? profile.username ?? "you";
  const date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date());

  return (
    <div className="grid auto-rows-max grid-cols-[minmax(0,1fr)] gap-3">
      <header className="flex items-start justify-between pt-1">
        <div>
          <div className="text-[0.8125rem] font-medium text-muted">{date}</div>
          <h1 className="mt-0.5 font-display text-heading font-bold tracking-[-0.02em]">
            {greeting()}, {name}
          </h1>
        </div>
        <StreakBadge streak={streak} />
      </header>

      <div className="flex items-end justify-between rounded-card border border-line bg-surface p-4">
        <div>
          <div className="text-caption font-medium text-muted">Today</div>
          <div className="mt-1.5 font-display text-hero font-bold tabular-nums">
            {todayPoints}
            <span className="font-sans text-body font-medium text-muted"> pts</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-caption font-medium text-muted">This week</div>
          <div className="mt-1 font-display text-title font-bold tabular-nums">
            {weekPoints}
            <span className="font-sans text-[0.8125rem] font-medium text-muted"> / {goal}</span>
          </div>
        </div>
      </div>

      <CoachBubble coach={profile.coach_style}>{coachLine(profile.coach_style, moment)}</CoachBubble>

      {nowOpen > 0 ? (
        <button
          type="button"
          onClick={openPlan}
          disabled={!view.online}
          className="flex h-11 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-accent text-[0.9375rem] font-semibold text-accent-text disabled:opacity-50"
        >
          <span className="material-symbol text-lg" aria-hidden>
            auto_awesome
          </span>
          Plan my day
        </button>
      ) : null}

      <SyncStatus />

      {nowOpen > 0 ? <p className="px-1 text-caption text-muted">Swipe right to complete, left for options.</p> : null}

      {overdue.length > 0 ? (
        <>
          <div className={`${sectionLabel} flex items-center gap-1 text-danger`}>
            <span className="material-symbol icon-outline text-base" aria-hidden>
              schedule
            </span>
            Overdue
          </div>
          {overdue.map((t) => (
            <TaskRow key={t.id} task={t} overdue subtasks={counts(t.id)} />
          ))}
        </>
      ) : null}

      {dueToday.length > 0 ? (
        <>
          <div className={`${sectionLabel} text-muted`}>Today</div>
          {dueToday.map((t) => (
            <TaskRow key={t.id} task={t} subtasks={counts(t.id)} />
          ))}
        </>
      ) : null}

      {nowOpen === 0 && completing.size === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line px-4 py-7 text-center">
          <div className="grid size-18 place-items-center rounded-full border-2 border-accent text-accent-text">
            <span className="material-symbol icon-outline text-[2.5rem]" aria-hidden>
              task_alt
            </span>
          </div>
          <div className="font-display text-title font-bold">{moment === "empty" ? "Nothing here yet" : "All clear"}</div>
          <p className="max-w-[260px] text-body-sm text-pretty text-muted">
            {moment === "empty" ? "Add what you need to get done today. Every tick earns points." : "Today's list is done. Add another or get ahead on tomorrow."}
          </p>
          <button type="button" onClick={openQuickAdd} className="h-11 rounded-full bg-accent px-5 text-[0.9375rem] font-semibold text-on-accent">
            Add a task
          </button>
        </div>
      ) : null}

      {upcoming.length > 0 ? (
        <Collapsible label={`Upcoming · ${upcoming.length}`} open={upcomingOpen} onToggle={() => setUpcomingOpen((o) => !o)}>
          {upcoming.map((t, i) => {
            const label = t.due_on ? formatDay(t.due_on, today) : "Someday";
            const prev = upcoming[i - 1];
            const prevLabel = prev ? (prev.due_on ? formatDay(prev.due_on, today) : "Someday") : null;
            return (
              <div key={t.id} className="contents">
                {label !== prevLabel ? <div className="px-1 pt-1 text-caption font-medium text-muted">{label}</div> : null}
                <TaskRow task={t} subtasks={counts(t.id)} />
              </div>
            );
          })}
        </Collapsible>
      ) : null}

      <Collapsible label={`Done · ${doneToday.length}`} open={doneOpen} onToggle={() => setDoneOpen((o) => !o)}>
        {doneToday.map((t) => (
          <DoneRow key={t.id} task={t} />
        ))}
      </Collapsible>
    </div>
  );
}

/** Flame and count: glowing when today's done, dashed "at risk" when it isn't yet. */
function StreakBadge({ streak }: { streak: StreakState }) {
  if (streak.state === "none") return null;
  if (streak.state === "risk") {
    return (
      <div
        aria-label={`${streak.count}-day streak at risk`}
        className="flex h-9 items-center gap-1 rounded-full border border-dashed border-line bg-surface pr-3 pl-2 text-muted"
      >
        <span className="material-symbol icon-outline text-[1.375rem]">local_fire_department</span>
        <span className="font-display text-body font-bold tabular-nums">{streak.count}</span>
        <span className="text-caption font-medium">at risk</span>
      </div>
    );
  }
  return (
    <div
      aria-label={`${streak.count}-day streak`}
      className="flex h-9 items-center gap-1 rounded-full border border-line bg-surface pr-3 pl-2 shadow-[0_0_18px_color-mix(in_oklab,#FF7A1A_35%,transparent)]"
    >
      <span className="material-symbol motion-safe:animate-flicker bg-linear-0 from-[#FF7A1A] to-[#FFC93D] bg-clip-text text-[1.375rem] text-transparent">
        local_fire_department
      </span>
      <span className="inline-block overflow-hidden font-display text-body font-bold tabular-nums">
        {/* Re-keyed so the number ticks up when the streak grows. */}
        <span key={streak.count} className="inline-block animate-tick">
          {streak.count}
        </span>
      </span>
    </div>
  );
}

function Collapsible({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`${sectionLabel} flex min-h-11 items-center justify-between pt-0 text-muted`}
      >
        <span>{label}</span>
        <span className="material-symbol text-xl" aria-hidden>
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>
      {open ? children : null}
    </>
  );
}

export function TodaySkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading your day">
      <div className="flex flex-col gap-2 pt-1">
        <div className="h-4 w-28 animate-pulse rounded-chip bg-surface-2" />
        <div className="h-8 w-52 animate-pulse rounded-chip bg-surface-2" />
      </div>
      <div className="h-[92px] animate-pulse rounded-card bg-surface" />
      <div className="h-16 animate-pulse rounded-card bg-surface" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[58px] animate-pulse rounded-card bg-surface" />
      ))}
    </div>
  );
}
