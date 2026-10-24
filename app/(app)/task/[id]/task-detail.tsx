"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useApp, useTasks } from "@/components/app/app-context";
import { ChoiceButton, Pips, PointsPill, Rating } from "@/components/tasks/task-bits";
import { useBreakdown } from "@/components/tasks/use-breakdown";
import { addDays, todayISO } from "@/lib/dates";
import { pointsFor } from "@/lib/tasks/points";
import type { Recurrence, Subtask, Task } from "@/lib/tasks/types";

const REPEAT: { id: Recurrence | null; label: string }[] = [
  { id: null, label: "Never" },
  { id: "daily", label: "Daily" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];
const CATEGORIES = ["Work", "Study", "Health", "Home", "Personal", "Money"];

const label = "text-caption font-semibold tracking-[0.06em] text-muted uppercase";
const fieldBase =
  "min-h-11 rounded-chip border border-line bg-surface px-3.5 text-body text-ink outline-none placeholder:text-muted focus:border-accent";
const field = `${fieldBase} w-full`;

export function TaskDetail({ id }: { id: string }) {
  const view = useTasks();
  const task = view.tasks.find((t) => t.id === id);

  return (
    <div className="flex flex-col gap-6">
      <header className="-ml-2 flex items-center gap-1">
        <BackButton />
        <h1 className="font-display text-title font-bold">Task</h1>
      </header>
      {!view.loaded ? (
        <div className="h-64 animate-pulse rounded-card bg-surface" aria-busy="true" />
      ) : task ? (
        <TaskForm key={task.id} task={task} subtasks={view.subtasks.filter((s) => s.task_id === id)} />
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-line p-5">
          <p className="font-display text-title font-bold">This task is gone</p>
          <p className="text-body-sm text-muted">It may have been deleted, or it finished more than a week ago.</p>
          <Link href="/today" className="font-semibold text-accent-text">
            Back to Today
          </Link>
        </div>
      )}
    </div>
  );
}

function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/today"))}
      aria-label="Back"
      className="grid size-11 place-items-center rounded-full hover:bg-surface-2"
    >
      <span className="material-symbol text-2xl" aria-hidden>
        chevron_left
      </span>
    </button>
  );
}

function TaskForm({ task, subtasks }: { task: Task; subtasks: Subtask[] }) {
  const { store, complete, completing, showToast } = useApp();
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [category, setCategory] = useState(task.category ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = Boolean(task.completed_at);
  const today = todayISO();

  const save = (patch: Parameters<typeof store.updateTask>[1]) => store.updateTask(task.id, patch);

  function commitTitle() {
    const clean = title.trim().slice(0, 140);
    if (!clean) return setTitle(task.title);
    if (clean !== task.title) save({ title: clean });
  }
  function commitCategory(next = category) {
    const clean = next.trim().slice(0, 24) || null;
    setCategory(clean ?? "");
    if (clean !== task.category) save({ category: clean });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
          aria-label="Title"
          rows={2}
          maxLength={140}
          className={`w-full resize-none bg-transparent font-display text-heading leading-[1.15] font-bold tracking-[-0.02em] outline-none ${done ? "text-muted line-through" : ""}`}
        />
        {done ? (
          <button
            type="button"
            onClick={() => store.uncompleteTask(task.id)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-line font-semibold"
          >
            <span className="material-symbol text-xl text-accent-text" aria-hidden>
              check_circle
            </span>
            Done · tap to undo
          </button>
        ) : (
          <button
            type="button"
            disabled={completing.has(task.id)}
            onClick={() => {
              complete(task.id);
              showToast(task.difficulty ? `+${pointsFor(task.difficulty)} pts` : "Done!", "check_circle");
            }}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent font-semibold text-on-accent disabled:opacity-70"
          >
            <span className="material-symbol text-xl" aria-hidden>
              check
            </span>
            Complete{task.difficulty ? ` · +${pointsFor(task.difficulty)} pts` : ""}
          </button>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className={label}>Difficulty</h2>
          <div className="flex items-center gap-2">
            <Pips difficulty={task.difficulty} />
            <PointsPill points={task.difficulty ? pointsFor(task.difficulty) : null} />
          </div>
        </div>
        <Rating difficulty={task.difficulty} reason={task.difficulty_reason} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={label}>When</h2>
        <div className="flex gap-2">
          {[
            { label: "Today", on: task.due_on === today, value: today },
            { label: "Tomorrow", on: task.due_on === addDays(today, 1), value: addDays(today, 1) },
            { label: "Someday", on: !task.due_on, value: null },
          ].map((o) => (
            <ChoiceButton
              key={o.label}
              on={o.on}
              className="flex-1"
              onClick={() => save(o.value ? { due_on: o.value } : { due_on: null, due_time: null, recurrence_rule: null })}
            >
              {o.label}
            </ChoiceButton>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-caption font-medium text-muted">
            Date
            <input
              type="date"
              value={task.due_on ?? ""}
              onChange={(e) => save(e.target.value ? { due_on: e.target.value } : { due_on: null, due_time: null, recurrence_rule: null })}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-caption font-medium text-muted">
            Time (optional)
            <input
              type="time"
              value={task.due_time?.slice(0, 5) ?? ""}
              disabled={!task.due_on}
              onChange={(e) => save({ due_time: e.target.value || null })}
              className={`${field} disabled:opacity-50`}
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={label}>Repeat</h2>
        <div className="flex flex-wrap gap-2">
          {REPEAT.map((r) => (
            <ChoiceButton
              key={r.label}
              on={task.recurrence_rule === r.id}
              onClick={() => save(r.id && !task.due_on ? { recurrence_rule: r.id, due_on: today } : { recurrence_rule: r.id })}
            >
              {r.label}
            </ChoiceButton>
          ))}
        </div>
        {task.recurrence_rule ? (
          <p className="text-caption text-muted">Finish it and the next one is scheduled automatically. Daily repeats work as habits.</p>
        ) : null}
      </section>

      <Subtasks task={task} subtasks={subtasks} />

      <section className="flex flex-col gap-3">
        <h2 className={label}>Category</h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <ChoiceButton key={c} on={task.category === c} onClick={() => commitCategory(task.category === c ? "" : c)}>
              {c}
            </ChoiceButton>
          ))}
        </div>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          onBlur={() => commitCategory()}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          maxLength={24}
          placeholder="Or type your own"
          aria-label="Category"
          className={field}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={label}>Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => (notes.trim() || null) !== task.notes && save({ notes: notes.trim().slice(0, 2000) || null })}
          rows={4}
          maxLength={2000}
          placeholder="Anything that helps. Only you can see this."
          aria-label="Notes"
          className={`${field} py-3`}
        />
      </section>

      <section className="flex items-start justify-between gap-4 rounded-card border border-line bg-surface p-4">
        <div>
          <h2 className="text-body font-semibold" id="share-label">
            Share this win
          </h2>
          <p className="mt-1 text-body-sm text-muted">
            When you finish, friends see the title and points in their feed. Notes and subtasks stay private.
          </p>
        </div>
        <Switch checked={task.is_shared} labelledBy="share-label" onChange={(is_shared) => save({ is_shared })} />
      </section>

      <button
        type="button"
        onClick={() => {
          if (!confirmDelete) return setConfirmDelete(true);
          store.deleteTask(task.id);
          showToast("Task deleted", "delete");
          router.push("/today");
        }}
        onBlur={() => setConfirmDelete(false)}
        className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-danger/50 font-semibold text-danger"
      >
        <span className="material-symbol icon-outline text-xl" aria-hidden>
          delete
        </span>
        {confirmDelete ? "Tap again to delete" : "Delete task"}
      </button>
    </div>
  );
}

function Subtasks({ task, subtasks }: { task: Task; subtasks: Subtask[] }) {
  const taskId = task.id;
  const { store } = useApp();
  const { online } = useTasks();
  const { breakdown, busy } = useBreakdown();
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const done = subtasks.filter((s) => s.done).length;
  const totalMinutes = subtasks.reduce((n, s) => n + (s.est_minutes ?? 0), 0);

  function add(e: FormEvent) {
    e.preventDefault();
    const clean = title.trim().slice(0, 140);
    if (!clean) return;
    const m = Math.round(Number(minutes));
    store.addSubtask(taskId, clean, m >= 1 && m <= 600 ? m : null);
    setTitle("");
    setMinutes("");
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className={label}>
        Steps
        {subtasks.length ? (
          <span className="normal-case">
            {" "}
            · {done}/{subtasks.length}
            {totalMinutes ? ` · ~${totalMinutes} min` : ""}
          </span>
        ) : null}
      </h2>
      {subtasks.length ? (
        <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
          {subtasks.map((s, i) => (
            <li key={s.id} className={`flex items-center gap-1 pr-1 pl-1 ${i ? "border-t border-line" : ""}`}>
              <button
                type="button"
                role="checkbox"
                aria-checked={s.done}
                aria-label={s.title}
                onClick={() => store.updateSubtask(s.id, { done: !s.done })}
                className="grid size-11 flex-none place-items-center"
              >
                {s.done ? (
                  <span className="grid size-6 animate-pop place-items-center rounded-full bg-accent text-on-accent">
                    <span className="material-symbol text-base [font-variation-settings:'wght'_700]">check</span>
                  </span>
                ) : (
                  <span className="box-border size-6 rounded-full border-2 border-muted" />
                )}
              </button>
              <span className={`flex-1 text-body-sm ${s.done ? "text-muted line-through" : ""}`}>{s.title}</span>
              {s.est_minutes ? <span className="text-caption text-muted tabular-nums">{s.est_minutes} min</span> : null}
              <button
                type="button"
                onClick={() => store.deleteSubtask(s.id)}
                aria-label={`Remove step ${s.title}`}
                className="grid size-11 place-items-center text-muted hover:text-danger"
              >
                <span className="material-symbol text-xl" aria-hidden>
                  close
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {subtasks.length === 0 && !task.completed_at ? (
        <button
          type="button"
          disabled={!online || busy}
          onClick={() => breakdown(task.id, task.title, task.notes)}
          className="flex min-h-11 items-center justify-center gap-2 rounded-full border-[1.5px] border-accent text-[0.9375rem] font-semibold text-accent-text disabled:opacity-50"
        >
          <span className={`material-symbol text-lg ${busy ? "motion-safe:animate-pulse" : ""}`} aria-hidden>
            auto_awesome
          </span>
          {busy ? "Breaking it down…" : online ? "Break it down with AI" : "Break it down (needs a connection)"}
        </button>
      ) : null}
      <form onSubmit={add} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a step"
          aria-label="New step"
          maxLength={140}
          enterKeyHint="done"
          className={`${fieldBase} min-w-0 flex-1`}
        />
        <input
          value={minutes}
          onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))}
          inputMode="numeric"
          placeholder="min"
          aria-label="Estimated minutes"
          className={`${fieldBase} w-16 flex-none px-1 text-center`}
        />
        <button type="submit" aria-label="Add step" disabled={!title.trim()} className="grid size-11 flex-none place-items-center rounded-full bg-accent text-on-accent disabled:opacity-50">
          <span className="material-symbol text-2xl" aria-hidden>
            add
          </span>
        </button>
      </form>
    </section>
  );
}

function Switch({ checked, onChange, labelledBy }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className="grid h-11 w-14 flex-none place-items-center"
    >
      <span className={`relative h-7 w-12 rounded-full transition-colors ${checked ? "bg-accent" : "bg-surface-2 ring-1 ring-line"}`}>
        <span
          className={`absolute top-0.5 size-6 rounded-full transition-[left] duration-150 ${checked ? "left-[22px] bg-on-accent" : "left-0.5 bg-muted"}`}
        />
      </span>
    </button>
  );
}
