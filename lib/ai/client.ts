"use client";

// Browser side of /api/ai. Every call resolves; failures come back as { error, message }.

import type { Difficulty } from "@/lib/tasks/types";

export type AIError = { error: string; message: string; remaining?: number };

export type ScoreResult = { difficulty: Difficulty; reason: string | null };
export type BreakdownResult = { steps: { title: string; minutes: number }[]; remaining: number };
export type PlanResult = { blocks: { taskId: string; start: string; end: string }[]; tip: string; remaining: number; today: string };
export type QuotaResult = { remaining: number; limit: number };

type Request =
  | { action: "score"; taskId: string }
  | { action: "breakdown"; title: string; notes?: string | null }
  | { action: "plan" }
  | { action: "quota" };

const OFFLINE: AIError = { error: "offline", message: "AI needs a connection. Try again when you're back online." };

async function call<T>(body: Request): Promise<T | AIError> {
  if (!navigator.onLine) return OFFLINE;
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error ?? "failed", message: data.message ?? "Something went wrong. Try again.", remaining: data.remaining };
    return data as T;
  } catch {
    return OFFLINE;
  }
}

export const isAIError = (r: unknown): r is AIError => typeof r === "object" && r !== null && "error" in r;

export const ai = {
  score: (taskId: string) => call<ScoreResult>({ action: "score", taskId }),
  breakdown: (title: string, notes?: string | null) => call<BreakdownResult>({ action: "breakdown", title, notes }),
  plan: () => call<PlanResult>({ action: "plan" }),
  quota: () => call<QuotaResult>({ action: "quota" }),
};
