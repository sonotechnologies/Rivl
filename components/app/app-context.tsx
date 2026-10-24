"use client";

import { createContext, use, useCallback, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Profile } from "@/lib/auth";
import { getBoardStore, rankWithMe, type BoardView } from "@/lib/board";
import { todayISO, weekStartISO } from "@/lib/dates";
import { expectedPoints, isHard, pointTotals } from "@/lib/tasks/points";
import { getTaskStore, type TaskStore, type TaskView } from "@/lib/tasks/store";

type Toast = { id: number; text: string; icon?: string };

type AppContextValue = {
  profile: Profile;
  store: TaskStore;
  /** Which bottom sheet is open: quick add, or options for a task id. */
  sheet: { kind: "add" } | { kind: "options"; taskId: string } | { kind: "plan" } | null;
  openQuickAdd: () => void;
  openPlan: () => void;
  openOptions: (taskId: string) => void;
  closeSheet: () => void;
  toast: Toast | null;
  showToast: (text: string, icon?: string) => void;
  /** Tasks mid-celebration: checkbox popped, points floating, about to move to Done. */
  completing: ReadonlySet<string>;
  /** Completes a task with the full win moment (haptic, pop, +pts, then slide to Done). */
  complete: (taskId: string) => void;
};

/** How long the row celebrates before it slides into Done (matches --animate-slide-out). */
const CELEBRATE_MS = 640;

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ profile, children }: { profile: Profile; children: ReactNode }) {
  const store = getTaskStore(profile.id);
  const [sheet, setSheet] = useState<AppContextValue["sheet"]>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [completing, setCompleting] = useState<ReadonlySet<string>>(new Set());

  const showToast = useCallback((text: string, icon?: string) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, icon });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const complete = useCallback(
    (taskId: string) => {
      const task = store.getView().tasks.find((t) => t.id === taskId);
      if (!task || task.completed_at) return;
      navigator.vibrate?.(isHard(task.difficulty) ? 25 : 10);
      if (expectedPoints(task) === 0) showToast("Too fresh for points: tasks need to be 10 minutes old. It still counts for your streak.", "schedule");
      setCompleting((prev) => new Set(prev).add(taskId));
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(
        () => {
          store.completeTask(taskId);
          setCompleting((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });
        },
        reduced ? 200 : CELEBRATE_MS,
      );
    },
    [store, showToast],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      profile,
      store,
      sheet,
      openQuickAdd: () => setSheet({ kind: "add" }),
      openPlan: () => setSheet({ kind: "plan" }),
      openOptions: (taskId) => setSheet({ kind: "options", taskId }),
      closeSheet: () => setSheet(null),
      toast,
      showToast,
      completing,
      complete,
    }),
    [profile, store, sheet, toast, showToast, completing, complete],
  );

  return <AppContext value={value}>{children}</AppContext>;
}

export function useApp() {
  const ctx = use(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

const SERVER_VIEW: TaskView = { loaded: false, tasks: [], subtasks: [], online: true, pending: 0, syncing: false, error: null, stats: null };
const getServerView = () => SERVER_VIEW;

/** Live tasks for the signed-in user (from the device cache, then the server). */
export function useTasks() {
  const { store } = useApp();
  return useSyncExternalStore(store.subscribe, store.getView, getServerView);
}

const SERVER_BOARD: BoardView = { rows: null, moved: {}, error: false };
const getServerBoard = () => SERVER_BOARD;

/**
 * The live weekly board, with your own row using your latest points (so it
 * agrees with Today even before the server has scored your last tick).
 */
export function useBoard() {
  const { profile } = useApp();
  const store = getBoardStore(profile.id);
  const board = useSyncExternalStore(store.subscribe, store.getView, getServerBoard);
  const { stats, tasks } = useTasks();
  const today = todayISO();
  const { weekPts } = pointTotals(stats, tasks, today, weekStartISO(today));
  const rows = board.rows ? rankWithMe(board.rows, weekPts) : null;
  return { ...board, rows };
}
