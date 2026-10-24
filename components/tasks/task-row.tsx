"use client";

import Link from "next/link";
import { useRef, useState, type PointerEvent } from "react";
import { useApp } from "@/components/app/app-context";
import { formatDay, formatTime } from "@/lib/dates";
import { isHard, pointsFor } from "@/lib/tasks/points";
import type { Task } from "@/lib/tasks/types";
import { Pips, PointsPill } from "./task-bits";

const SWIPE_MAX = 130;
const SWIPE_TRIGGER = 80;

// 14 particles in a ring, as in the prototype.
const CONFETTI = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  const r = 34 + (i % 3) * 16;
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r), round: i % 2 === 1, ink: i % 3 === 0 };
});

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function TaskRow({
  task,
  overdue = false,
  subtasks,
}: {
  task: Task;
  overdue?: boolean;
  subtasks: { done: number; total: number };
}) {
  const { completing, complete, openOptions } = useApp();
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const isCompleting = completing.has(task.id);
  const points = pointsFor(task.difficulty);

  const meta = [
    overdue && task.due_on ? `Due ${formatDay(task.due_on).toLowerCase()}` : null,
    task.due_time ? formatTime(task.due_time) : null,
    task.category,
    subtasks.total ? `${subtasks.done}/${subtasks.total} steps` : null,
  ].filter(Boolean);

  function onPointerDown(e: PointerEvent) {
    if (isCompleting || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  }
  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const x = e.clientX - d.x;
    // Vertical scrolls win until the finger clearly goes sideways.
    if (!d.moved && (Math.abs(x) < 8 || Math.abs(e.clientY - d.y) > Math.abs(x))) return;
    if (!d.moved) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    d.moved = true;
    setDx(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, x)));
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    const final = dx;
    setDx(0);
    if (final > SWIPE_TRIGGER) complete(task.id);
    else if (final < -SWIPE_TRIGGER) openOptions(task.id);
    // Swallow the click that follows a swipe.
    const block = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    window.addEventListener("click", block, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", block, { capture: true }), 0);
  }

  return (
    <div className="relative">
      <div className={`relative overflow-hidden rounded-card ${isCompleting ? "animate-slide-out" : ""}`}>
        {dx !== 0 ? (
          <div className="absolute inset-0 grid grid-cols-2 text-body-sm font-semibold" aria-hidden>
            <div className="flex items-center gap-1.5 bg-accent pl-[18px] text-on-accent">
              <span className="material-symbol text-xl">check</span>Done
            </div>
            <div className="flex items-center justify-end gap-1.5 bg-surface-2 pr-[18px]">
              Options<span className="material-symbol text-xl">more_horiz</span>
            </div>
          </div>
        ) : null}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => {
            e.preventDefault();
            openOptions(task.id);
          }}
          className="relative flex touch-pan-y items-center gap-2 rounded-card border border-line bg-surface py-1.5 pr-3 pl-1 select-none"
          style={{ transform: `translateX(${dx}px)`, transition: dx ? "none" : "transform 200ms ease-out" }}
        >
          <button
            type="button"
            onClick={() => complete(task.id)}
            aria-label={`Complete ${task.title}`}
            className="grid size-11 flex-none place-items-center"
          >
            {isCompleting ? (
              <span className="grid size-7 animate-pop place-items-center rounded-full bg-accent text-on-accent">
                <span className="material-symbol text-lg [font-variation-settings:'wght'_700]">check</span>
              </span>
            ) : (
              <span className="box-border size-7 rounded-full border-2 border-muted" />
            )}
          </button>
          <Link href={`/task/${task.id}`} className="min-w-0 flex-1 py-1" draggable={false}>
            <div className="truncate text-[0.9375rem] font-medium">{task.title}</div>
            <div className="mt-[5px] flex items-center gap-2">
              <Pips difficulty={task.difficulty} />
              {task.recurrence_rule ? (
                <span className="material-symbol text-sm text-muted" aria-label="Repeats">
                  repeat
                </span>
              ) : null}
              {meta.length ? <span className={`truncate text-caption ${overdue ? "text-danger" : "text-muted"}`}>{meta.join(" · ")}</span> : null}
            </div>
          </Link>
          <PointsPill points={points} />
        </div>
      </div>
      {isCompleting ? (
        <>
          <span
            className="pointer-events-none absolute -top-2 right-3.5 animate-float-up font-display text-lg font-bold text-accent-text"
            aria-hidden
          >
            +{points}
          </span>
          {isHard(task.difficulty) && !prefersReducedMotion() ? (
            <span className="pointer-events-none absolute top-1/2 left-[26px] size-0" aria-hidden>
              {CONFETTI.map((c, i) => (
                <span
                  key={i}
                  className={`absolute top-0 left-0 animate-burst ${c.round ? "size-1.5 rounded-full" : "h-1 w-2 rounded-[1px]"} ${c.ink ? "bg-ink" : "bg-accent"}`}
                  style={{ "--dx": `${c.dx}px`, "--dy": `${c.dy}px` } as React.CSSProperties}
                />
              ))}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** A finished task in the Done list: tap the tick to undo. */
export function DoneRow({ task }: { task: Task }) {
  const { store } = useApp();
  return (
    <div className="flex animate-fade-in items-center gap-2 rounded-card border border-line bg-surface py-1.5 pr-3 pl-1">
      <button
        type="button"
        onClick={() => store.uncompleteTask(task.id)}
        aria-label={`Mark ${task.title} not done`}
        className="grid size-11 flex-none place-items-center"
      >
        <span className="grid size-7 place-items-center rounded-full bg-accent text-on-accent">
          <span className="material-symbol text-lg [font-variation-settings:'wght'_700]">check</span>
        </span>
      </button>
      <Link href={`/task/${task.id}`} className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium text-muted line-through">
        {task.title}
      </Link>
      <PointsPill points={pointsFor(task.difficulty)} muted />
    </div>
  );
}
