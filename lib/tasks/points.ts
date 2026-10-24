import { addDays, toISODate } from "@/lib/dates";
import type { Stats } from "./store";
import type { Difficulty, Task } from "./types";

/** Base points per difficulty, from the build brief. Bonuses and caps are applied server-side (build step 4). */
const BASE_POINTS: Record<Difficulty, number> = { 1: 5, 2: 10, 3: 20, 4: 35, 5: 50 };

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: "Easy",
  2: "Light",
  3: "Medium",
  4: "Hard",
  5: "Brutal",
};

export const DEFAULT_DIFFICULTY: Difficulty = 2;

export const DIFFICULTIES = [1, 2, 3, 4, 5] as const satisfies readonly Difficulty[];

export const pointsFor = (difficulty: Difficulty | null) => BASE_POINTS[difficulty ?? DEFAULT_DIFFICULTY];

/** Difficulty 4–5 earns confetti. */
export const isHard = (difficulty: Difficulty | null) => (difficulty ?? 0) >= 4;

/** Tasks must exist this long before finishing them earns points (anti-cheat). */
export const MIN_TASK_AGE_MS = 10 * 60_000;

/**
 * What the server will award for finishing `task` at `at`, mirroring
 * award_task_points(): base, +20% on or before the due date, nothing if under
 * 10 minutes old. The 300/day cap is left to the server.
 */
export function expectedPoints(task: Task, at = task.completed_at ?? new Date().toISOString()) {
  if (new Date(at).getTime() - new Date(task.created_at).getTime() < MIN_TASK_AGE_MS) return 0;
  const base = pointsFor(task.difficulty);
  const day = toISODate(new Date(at));
  return base + (task.due_on && day <= task.due_on ? Math.round(base * 0.2) : 0);
}

export type StreakState = { count: number; state: "active" | "risk" | "none" };

/**
 * The streak to show right now, mirroring streak_on_complete(): server state,
 * plus today's local completions before they've synced.
 */
export function displayStreak(stats: Stats | null, completedToday: boolean, today: string): StreakState {
  if (!stats) return { count: 0, state: "none" };
  const { streak_count: count, streak_last_on: last, streak_freezes: freezes } = stats;
  if (last === today) return { count, state: "active" };
  const alive = last === addDays(today, -1) || (last === addDays(today, -2) && freezes > 0);
  if (completedToday) return { count: alive ? count + 1 : 1, state: "active" };
  if (alive && count > 0) return { count, state: "risk" };
  return { count: 0, state: "none" };
}

/**
 * Today's and this week's points: what the server has awarded, plus wins made
 * since it last reported (task points, and the streak bonus for the day's first tick).
 */
export function pointTotals(stats: Stats | null, tasks: Task[], today: string, weekStart: string) {
  const events = stats?.events ?? [];
  let todayPts = 0;
  let weekPts = 0;
  for (const e of events) {
    if (e.day === today) todayPts += e.amount;
    if (e.day >= weekStart) weekPts += e.amount;
  }
  const since = stats?.fetched_at ?? "";
  let unscoredToday = false;
  for (const t of tasks) {
    if (!t.completed_at || t.completed_at <= since) continue;
    const day = toISODate(new Date(t.completed_at));
    const pts = expectedPoints(t);
    if (day === today) {
      todayPts += pts;
      unscoredToday = true;
    }
    if (day >= weekStart) weekPts += pts;
  }
  if (unscoredToday && stats?.streak_last_on !== today) {
    const streak = displayStreak(stats, true, today).count;
    const bonus = 5 * Math.min(5, 1 + Math.floor((streak - 1) / 7));
    todayPts += bonus;
    weekPts += bonus;
  }
  return { todayPts, weekPts };
}

/** Points shown for a finished task: the server's figure once it has one. */
export function awardedPoints(stats: Stats | null, task: Task) {
  const events = stats?.events.filter((e) => e.task_id === task.id);
  if (events?.length) return events.reduce((n, e) => n + e.amount, 0);
  // Scored already and earned nothing (too fresh, or over the daily cap).
  if (stats && task.completed_at && task.completed_at <= stats.fetched_at) return 0;
  return expectedPoints(task);
}
