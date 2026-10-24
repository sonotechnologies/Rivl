"use client";

import { useState, type FormEvent } from "react";
import { useApp, useTasks } from "@/components/app/app-context";
import { Sheet } from "@/components/ui/sheet";
import { addDays, todayISO } from "@/lib/dates";
import { ChoiceButton } from "./task-bits";
import { useBreakdown } from "./use-breakdown";

const DUE = [
  { id: "today", label: "Today", date: () => todayISO() },
  { id: "tomorrow", label: "Tomorrow", date: () => addDays(todayISO(), 1) },
  { id: "someday", label: "Someday", date: () => null },
] as const;

export function QuickAddSheet() {
  const { store, closeSheet, showToast } = useApp();
  const { online } = useTasks();
  const { breakdown } = useBreakdown();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<(typeof DUE)[number]["id"]>("today");
  const [splitIt, setSplitIt] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const clean = title.trim().slice(0, 140);
    if (!clean) return;
    const id = store.createTask({ title: clean, due_on: DUE.find((d) => d.id === due)!.date() });
    closeSheet();
    if (splitIt && online) {
      showToast("Breaking it down…", "auto_awesome");
      void breakdown(id, clean);
    } else {
      showToast(due === "today" ? "Added to today" : due === "tomorrow" ? "Added for tomorrow" : "Added to someday", "check_circle");
    }
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
        <div className="flex gap-2" role="group" aria-label="When">
          {DUE.map((d) => (
            <ChoiceButton key={d.id} on={due === d.id} onClick={() => setDue(d.id)} className="flex-1">
              {d.label}
            </ChoiceButton>
          ))}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={splitIt && online}
          disabled={!online}
          onClick={() => setSplitIt((v) => !v)}
          className="flex min-h-11 items-center gap-3 rounded-chip border border-line bg-bg px-3.5 text-left disabled:opacity-50"
        >
          <span className="material-symbol text-xl text-accent-text" aria-hidden>
            auto_awesome
          </span>
          <span className="flex-1">
            <span className="block text-body-sm font-semibold">Break it down with AI</span>
            <span className="block text-caption text-muted">{online ? "3–8 steps with time estimates · uses 1 AI action" : "Needs a connection"}</span>
          </span>
          <span className={`relative h-6 w-10 flex-none rounded-full transition-colors ${splitIt && online ? "bg-accent" : "bg-surface-2 ring-1 ring-line"}`}>
            <span className={`absolute top-0.5 size-5 rounded-full transition-[left] duration-150 ${splitIt && online ? "left-[18px] bg-on-accent" : "left-0.5 bg-muted"}`} />
          </span>
        </button>
        <p className="-mt-1 text-caption text-muted">The AI rates how hard it is, so points stay fair.</p>
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
