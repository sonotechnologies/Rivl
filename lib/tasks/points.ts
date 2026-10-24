import type { Difficulty } from "./types";

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
