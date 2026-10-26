"use client";

import Link from "next/link";
import { useApp, useTasks } from "@/components/app/app-context";
import { Sheet } from "@/components/ui/sheet";
import { addDays, todayISO } from "@/lib/dates";
import { Rating } from "./task-bits";

const item = "flex h-13 w-full items-center gap-3 px-4 text-left text-[0.9375rem] font-medium";

export function TaskOptionsSheet({ taskId }: { taskId: string }) {
  const { store, closeSheet, showToast, complete } = useApp();
  const task = useTasks().tasks.find((t) => t.id === taskId);
  if (!task) return null;

  return (
    <Sheet
      title={
        <>
          {task.title}
          <div className="mt-1.5 font-sans font-normal">
            <Rating difficulty={task.difficulty} reason={task.difficulty_reason} />
          </div>
        </>
      }
      onClose={closeSheet}
    >
      <div className="flex flex-col overflow-hidden rounded-card border border-line bg-bg">
        <button
          type="button"
          data-autofocus
          className={item}
          onClick={() => {
            closeSheet();
            complete(task.id);
          }}
        >
          <span className="material-symbol icon-outline text-[1.375rem] text-accent-text" aria-hidden>
            check_circle
          </span>
          Complete
        </button>
        <button
          type="button"
          className={`${item} border-t border-line`}
          onClick={() => {
            store.updateTask(task.id, { due_on: addDays(todayISO(), 1) });
            closeSheet();
            showToast("Moved to tomorrow", "event_upcoming");
          }}
        >
          <span className="material-symbol icon-outline text-[1.375rem] text-muted" aria-hidden>
            event_upcoming
          </span>
          Move to tomorrow
        </button>
        <Link href={`/focus?task=${task.id}`} onClick={closeSheet} className={`${item} border-t border-line`}>
          <span className="material-symbol icon-outline text-[1.375rem] text-muted" aria-hidden>
            timer
          </span>
          Focus for 25 min · +5
        </Link>
        <Link href={`/task/${task.id}`} onClick={closeSheet} className={`${item} border-t border-line`}>
          <span className="material-symbol icon-outline text-[1.375rem] text-muted" aria-hidden>
            edit
          </span>
          Details, subtasks and repeat
        </Link>
        <button
          type="button"
          className={`${item} border-t border-line text-danger`}
          onClick={() => {
            store.deleteTask(task.id);
            closeSheet();
            showToast("Task deleted", "delete");
          }}
        >
          <span className="material-symbol icon-outline text-[1.375rem]" aria-hidden>
            delete
          </span>
          Delete
        </button>
      </div>
    </Sheet>
  );
}
