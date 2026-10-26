"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp, useFocus, useTasks } from "@/components/app/app-context";
import { FOCUS_MINUTES, FOCUS_MS, FOCUS_PER_DAY, FOCUS_POINTS, remainingMs } from "@/lib/focus";

const R = 128;
const C = 2 * Math.PI * R;

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** A 25-minute focus session on a task: +5 when it ends, up to 8 a day. */
export function FocusScreen() {
  const { complete, showToast } = useApp();
  const { tasks, online } = useTasks();
  const { loaded, running, today, finished, error, store } = useFocus();
  const router = useRouter();
  const params = useSearchParams();
  const [picked, setPicked] = useState<string | null>(params.get("task"));
  const [now, setNow] = useState(() => Date.now());
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [starting, setStarting] = useState(false);

  const taskId = running?.taskId ?? finished?.taskId ?? picked;
  const task = tasks.find((t) => t.id === taskId);
  const open = tasks.filter((t) => !t.completed_at);
  const left = running ? remainingMs(running, now) : FOCUS_MS;
  const progress = running ? 1 - left / FOCUS_MS : finished ? 1 : 0;

  // Tick every second while running; keep the screen awake and the tab title live.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    let lock: WakeLockSentinel | null = null;
    const wake = () => {
      if (document.visibilityState === "visible") void navigator.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    wake();
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", wake);
      void lock?.release();
    };
  }, [running]);

  useEffect(() => {
    const base = "Focus · Rivl";
    document.title = running ? `${clock(left)} · Focus` : base;
    return () => {
      document.title = base;
    };
  }, [running, left]);

  // The win: buzz once, then stay on the done state until they move on.
  useEffect(() => {
    if (!finished) return;
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([20, 60, 20]);
    return () => store.clearFinished();
  }, [finished, store]);

  async function start(id: string | null) {
    setStarting(true);
    await store.start(id);
    setNow(Date.now());
    setStarting(false);
    setConfirmQuit(false);
  }

  const state = running ? "running" : finished ? "done" : "ready";

  return (
    <div className="flex flex-col items-center gap-6 pt-1">
      <header className="-ml-2 flex items-center gap-1 self-stretch">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/today"))}
          aria-label="Back"
          className="grid size-11 place-items-center rounded-full"
        >
          <span className="material-symbol text-2xl" aria-hidden>
            arrow_back
          </span>
        </button>
        <h1 className="font-display text-title font-bold">Focus</h1>
      </header>

      <div className="text-center">
        <p className="text-caption font-semibold tracking-[0.06em] text-muted uppercase">{task ? "Focusing on" : "Focus session"}</p>
        <p className="mt-1 max-w-[320px] font-display text-title leading-tight font-bold text-pretty">{task?.title ?? `${FOCUS_MINUTES} minutes, no distractions`}</p>
      </div>

      <div className="relative grid size-[280px] place-items-center" role="timer" aria-label={running ? `${clock(left)} left` : undefined}>
        <svg viewBox="0 0 280 280" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="140" cy="140" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
          <circle
            cx="140"
            cy="140"
            r={R}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        {state === "done" ? (
          <div className="flex animate-pop flex-col items-center">
            <span className="font-display text-[4rem] leading-none font-bold text-accent-text tabular-nums">{finished!.points ? `+${finished!.points}` : "Done"}</span>
            <span className="mt-2 text-body-sm font-semibold text-muted">{finished!.points ? "Focus session done" : "Daily focus points maxed"}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <span className="font-display text-[4rem] leading-none font-bold tabular-nums">{clock(left)}</span>
            <span className="mt-2 text-body-sm font-semibold text-muted">{running ? "Stay with it" : `+${FOCUS_POINTS} pts when it ends`}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-1.5" aria-label={`${Math.min(today, FOCUS_PER_DAY)} of ${FOCUS_PER_DAY} focus sessions today`} role="img">
          {Array.from({ length: FOCUS_PER_DAY }, (_, i) => (
            <span key={i} className={`size-2.5 rounded-full ${i < today ? "bg-accent" : "bg-surface-2 ring-1 ring-line"}`} />
          ))}
        </div>
        <p className="text-caption text-muted">
          {today >= FOCUS_PER_DAY ? "8 of 8 today. More sessions still help, but earn no points." : `${today} of ${FOCUS_PER_DAY} today · +${FOCUS_POINTS} each`}
        </p>
      </div>

      <div className="flex w-full max-w-[360px] flex-col gap-3">
        {state === "ready" ? (
          <>
            {open.length && !params.get("task") ? (
              <label className="flex flex-col gap-1.5 text-body-sm font-medium">
                Task (optional)
                <select
                  value={picked ?? ""}
                  onChange={(e) => setPicked(e.target.value || null)}
                  className="min-h-11 rounded-chip border border-line bg-surface px-3.5 text-body text-ink"
                >
                  <option value="">No specific task</option>
                  {open.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              disabled={!loaded || !online || starting}
              onClick={() => start(taskId)}
              className="flex h-13 items-center justify-center gap-2 rounded-full bg-accent text-body font-semibold text-on-accent disabled:opacity-50"
            >
              <span className="material-symbol text-xl" aria-hidden>
                play_arrow
              </span>
              {online ? `Start ${FOCUS_MINUTES} minutes` : "Focus needs a connection to start"}
            </button>
          </>
        ) : state === "running" ? (
          <button
            type="button"
            onClick={() => {
              if (!confirmQuit) return setConfirmQuit(true);
              void store.cancel();
              setConfirmQuit(false);
              showToast("Session ended. No points this time.", "timer_off");
            }}
            className={`h-13 rounded-full border text-body font-semibold ${confirmQuit ? "border-danger text-danger" : "border-line text-muted"}`}
          >
            {confirmQuit ? "Tap again to give up" : "Give up"}
          </button>
        ) : (
          <>
            {task && !task.completed_at ? (
              <button
                type="button"
                onClick={() => {
                  complete(task.id);
                  router.push("/today");
                }}
                className="flex h-13 items-center justify-center gap-2 rounded-full bg-accent text-body font-semibold text-on-accent"
              >
                <span className="material-symbol text-xl" aria-hidden>
                  check_circle
                </span>
                Mark it done
              </button>
            ) : null}
            <button
              type="button"
              disabled={!online || starting}
              onClick={() => start(taskId)}
              className={`h-13 rounded-full text-body font-semibold disabled:opacity-50 ${task && !task.completed_at ? "border border-line" : "bg-accent text-on-accent"}`}
            >
              Another round
            </button>
            <Link href="/today" className="py-2 text-center text-body-sm font-semibold text-muted">
              Take a break
            </Link>
          </>
        )}
        {error ? (
          <p role="alert" className="text-center text-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
