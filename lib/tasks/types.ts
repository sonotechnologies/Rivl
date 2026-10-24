export const RECURRENCES = ["daily", "weekdays", "weekly", "monthly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type Task = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  /** YYYY-MM-DD in the owner's time zone. */
  due_on: string | null;
  /** HH:MM(:SS). */
  due_time: string | null;
  category: string | null;
  difficulty: Difficulty | null;
  difficulty_reason: string | null;
  recurrence_rule: Recurrence | null;
  series_id: string | null;
  is_shared: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Subtask = {
  id: string;
  task_id: string;
  title: string;
  est_minutes: number | null;
  done: boolean;
  position: number;
  created_at: string;
};

/** Fields the client may write; everything else is set by the database. */
export type TaskPatch = Partial<
  Pick<Task, "title" | "notes" | "due_on" | "due_time" | "category" | "difficulty" | "recurrence_rule" | "is_shared" | "completed_at">
>;
export type SubtaskPatch = Partial<Pick<Subtask, "title" | "est_minutes" | "done" | "position">>;

export const TASK_COLUMNS =
  "id, user_id, title, notes, due_on, due_time, category, difficulty, difficulty_reason, recurrence_rule, series_id, is_shared, completed_at, created_at, updated_at";
export const SUBTASK_COLUMNS = "id, task_id, title, est_minutes, done, position, created_at";
