"use client";

import { useState, type FormEvent } from "react";
import { useApp } from "@/components/app/app-context";
import { Sheet } from "@/components/ui/sheet";
import { addDays, todayISO } from "@/lib/dates";
import { DEFAULT_DIFFICULTY, DIFFICULTY_LABELS, pointsFor } from "@/lib/tasks/points";
import type { Difficulty } from "@/lib/tasks/types";
import { ChoiceButton, DifficultyPicker, PointsPill } from "./task-bits";

const DUE = [
  { id: "today", label: "Today", date: () => todayISO() },
  { id: "tomorrow", label: "Tomorrow", date: () => addDays(todayISO(), 1) },
  { id: "someday", label: "Someday", date: () => null },
] as const;

export function QuickAddSheet() {
  const { store, closeSheet, showToast } = useApp();
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [due, setDue] = useState<(typeof DUE)[number]["id"]>("today");

  function submit(e: FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    store.createTask({ title: clean.slice(0, 140), difficulty, due_on: DUE.find((d) => d.id === due)!.date() });
    closeSheet();
    showToast(due === "today" ? "Added to today" : due === "tomorrow" ? "Added for tomorrow" : "Added to someday", "check_circle");
  }

  return (
    <Sheet title="Quick add" onClose={closeSheet}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          aria-label="Task"
          maxLength={140}
          enterKeyHint="done"
          className="h-12 rounded-chip border-[1.5px] border-line bg-bg px-3.5 text-body font-medium text-ink outline-none placeholder:text-muted focus:border-accent"
        />
        <div className="flex items-baseline justify-between">
          <span className="text-body-sm font-medium text-muted">Difficulty · {DIFFICULTY_LABELS[difficulty]}</span>
          <PointsPill points={pointsFor(difficulty)} prefix="+" />
        </div>
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <div className="flex gap-2" role="group" aria-label="When">
          {DUE.map((d) => (
            <ChoiceButton key={d.id} on={due === d.id} onClick={() => setDue(d.id)} className="flex-1">
              {d.label}
            </ChoiceButton>
          ))}
        </div>
        <button
          type="submit"
          disabled={!title.trim()}
          className="h-13 rounded-full bg-accent text-body font-semibold text-on-accent transition-opacity disabled:opacity-50"
        >
          Add task
        </button>
      </form>
    </Sheet>
  );
}
