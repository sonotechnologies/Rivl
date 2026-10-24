"use client";

import { useState } from "react";
import { useApp } from "@/components/app/app-context";
import { ai, isAIError } from "@/lib/ai/client";

/** AI task breakdown: fetches 3–8 steps and adds them to the task. */
export function useBreakdown() {
  const { store, showToast } = useApp();
  const [busy, setBusy] = useState(false);

  async function breakdown(taskId: string, title: string, notes?: string | null) {
    setBusy(true);
    try {
      const result = await ai.breakdown(title, notes);
      if (isAIError(result)) {
        showToast(result.message, "auto_awesome");
        return false;
      }
      for (const step of result.steps) store.addSubtask(taskId, step.title, step.minutes);
      showToast(`Added ${result.steps.length} steps · ${result.remaining} AI ${result.remaining === 1 ? "action" : "actions"} left today`, "auto_awesome");
      return true;
    } finally {
      setBusy(false);
    }
  }

  return { breakdown, busy };
}
