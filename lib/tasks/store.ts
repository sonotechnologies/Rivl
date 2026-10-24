"use client";

import { createStore, del, get, set } from "idb-keyval";
import { ai, isAIError } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/client";
import { weekStartISO } from "@/lib/dates";
import { SUBTASK_COLUMNS, TASK_COLUMNS, type Subtask, type SubtaskPatch, type Task, type TaskPatch } from "./types";

/*
 * Offline-first task store.
 *
 * The device keeps the last server snapshot plus an outbox of pending writes,
 * both in IndexedDB. What the UI sees is the snapshot with the outbox replayed
 * on top, so every change shows instantly and survives reloads without a
 * connection. The outbox is flushed to Supabase in order whenever we're
 * online; row-level security does the authorisation.
 */

type TaskInsert = Pick<Task, "id" | "user_id" | "title"> & TaskPatch;
type SubtaskInsert = Pick<Subtask, "id" | "task_id" | "title" | "position"> & SubtaskPatch;

/** `rescore`: the task whose AI rating may change once this write lands. */
type Op = { opId: string; at: string; rescore?: string } & (
  | { kind: "task.insert"; row: TaskInsert }
  | { kind: "task.update"; id: string; patch: TaskPatch }
  | { kind: "task.delete"; id: string }
  | { kind: "subtask.insert"; row: SubtaskInsert }
  | { kind: "subtask.update"; id: string; patch: SubtaskPatch }
  | { kind: "subtask.delete"; id: string }
);

type OpInput = Op extends infer O ? (O extends Op ? Omit<O, "opId" | "at" | "rescore"> : never) : never;

/** Server-owned game state: streak, this week's point events and earned badges. */
export type Stats = {
  streak_count: number;
  streak_last_on: string | null;
  streak_freezes: number;
  streak_best: number;
  weekly_goal: number;
  events: { task_id: string | null; type: string; amount: number; day: string }[];
  badges: string[];
  /** When this was read; completions after it haven't been scored yet. */
  fetched_at: string;
};

type Snapshot = { tasks: Task[]; subtasks: Subtask[]; fetchedAt: string | null; stats?: Stats };

export type TaskView = {
  /** False until the device cache has been read. */
  loaded: boolean;
  tasks: Task[];
  subtasks: Subtask[];
  online: boolean;
  /** Writes waiting to reach the server. */
  pending: number;
  syncing: boolean;
  /** Last write the server refused (it has been rolled back). */
  error: string | null;
  /** Null until the first successful fetch (or the device cache has some). */
  stats: Stats | null;
};

/** How far back completed tasks are kept on the device (for Done and weekly totals). */
const HISTORY_DAYS = 8;
const POLL_MS = 60_000;

const idb = typeof indexedDB === "undefined" ? undefined : createStore("rivl", "tasks");
const key = (userId: string, name: string) => `${userId}:${name}`;

function replay({ tasks, subtasks }: Snapshot, outbox: Op[]) {
  const t = new Map(tasks.map((x) => [x.id, x]));
  const s = new Map(subtasks.map((x) => [x.id, x]));
  for (const op of outbox) {
    switch (op.kind) {
      case "task.insert":
        if (!t.has(op.row.id))
          t.set(op.row.id, {
            notes: null,
            due_on: null,
            due_time: null,
            category: null,
            difficulty: null,
            difficulty_reason: null,
            recurrence_rule: null,
            series_id: null,
            is_shared: false,
            completed_at: null,
            created_at: op.at,
            updated_at: op.at,
            ...op.row,
          });
        break;
      case "task.update": {
        const cur = t.get(op.id);
        if (cur) t.set(op.id, { ...cur, ...op.patch, updated_at: op.at });
        break;
      }
      case "task.delete":
        t.delete(op.id);
        for (const [id, sub] of s) if (sub.task_id === op.id) s.delete(id);
        break;
      case "subtask.insert":
        if (!s.has(op.row.id) && t.has(op.row.task_id))
          s.set(op.row.id, { est_minutes: null, done: false, created_at: op.at, ...op.row });
        break;
      case "subtask.update": {
        const cur = s.get(op.id);
        if (cur) s.set(op.id, { ...cur, ...op.patch });
        break;
      }
      case "subtask.delete":
        s.delete(op.id);
        break;
    }
  }
  return {
    tasks: [...t.values()],
    subtasks: [...s.values()].sort((a, b) => a.position - b.position),
  };
}

/** supabase-js reports network failures as errors without a Postgres/PostgREST code. */
const isNetworkError = (e: { code?: string } | null) => Boolean(e && !e.code);

const describe = (op: Op) =>
  op.kind.startsWith("subtask") ? "a subtask change" : op.kind === "task.insert" ? "a new task" : "a task change";

class TaskStore {
  private snapshot: Snapshot = { tasks: [], subtasks: [], fetchedAt: null };
  private outbox: Op[] = [];
  private inFlight: string | null = null;
  private flushing = false;
  private fetching = false;
  private flushedSinceFetch = 0;
  private view: TaskView;
  private listeners = new Set<() => void>();
  private client: ReturnType<typeof createClient> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Tasks waiting for an AI rating, and tasks already tried this session. */
  private toScore = new Set<string>();
  private scoreTried = new Set<string>();
  private scoring = false;

  constructor(private userId: string) {
    this.view = { loaded: false, tasks: [], subtasks: [], online: true, pending: 0, syncing: false, error: null, stats: null };
    if (typeof window === "undefined") return;
    this.view.online = navigator.onLine;
    void this.load();
    window.addEventListener("online", () => this.setOnline(true));
    window.addEventListener("offline", () => this.setOnline(false));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void this.sync();
    });
    setInterval(() => {
      if (document.visibilityState === "visible") void this.sync();
    }, POLL_MS);
  }

  private get supabase() {
    return (this.client ??= createClient());
  }

  // ── useSyncExternalStore ────────────────────────────────────────────────
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getView = () => this.view;

  private emit(patch: Partial<TaskView> = {}) {
    const { tasks, subtasks } = replay(this.snapshot, this.outbox);
    this.view = { ...this.view, ...patch, tasks, subtasks, pending: this.outbox.length, stats: this.snapshot.stats ?? null };
    this.listeners.forEach((fn) => fn());
  }

  // ── Public API ──────────────────────────────────────────────────────────
  createTask(input: Omit<TaskInsert, "id" | "user_id">) {
    const id = crypto.randomUUID();
    this.push({ kind: "task.insert", row: { ...input, id, user_id: this.userId } });
    return id;
  }
  updateTask(id: string, patch: TaskPatch) {
    this.push({ kind: "task.update", id, patch });
  }
  completeTask(id: string) {
    this.updateTask(id, { completed_at: new Date().toISOString() });
  }
  uncompleteTask(id: string) {
    this.updateTask(id, { completed_at: null });
  }
  deleteTask(id: string) {
    this.push({ kind: "task.delete", id });
  }
  addSubtask(taskId: string, title: string, estMinutes: number | null = null) {
    const siblings = this.view.subtasks.filter((s) => s.task_id === taskId);
    const position = siblings.reduce((max, s) => Math.max(max, s.position + 1), 0);
    this.push({ kind: "subtask.insert", row: { id: crypto.randomUUID(), task_id: taskId, title, position, est_minutes: estMinutes } });
  }
  updateSubtask(id: string, patch: SubtaskPatch) {
    this.push({ kind: "subtask.update", id, patch });
  }
  deleteSubtask(id: string) {
    this.push({ kind: "subtask.delete", id });
  }
  dismissError() {
    this.emit({ error: null });
  }

  /** Pushes pending writes, then pulls the latest from the server. */
  async sync() {
    await this.flush();
    if (this.outbox.length === 0) await this.fetch();
    void this.score();
  }

  // ── Internals ───────────────────────────────────────────────────────────
  private async load() {
    if (idb) {
      const [snapshot, outbox] = await Promise.all([
        get<Snapshot>(key(this.userId, "snapshot"), idb),
        get<Op[]>(key(this.userId, "outbox"), idb),
      ]);
      if (snapshot) this.snapshot = snapshot;
      if (outbox) this.outbox = [...outbox, ...this.outbox];
    }
    this.emit({ loaded: true });
    void this.sync();
  }

  private push(input: OpInput) {
    const op = { ...input, opId: crypto.randomUUID(), at: new Date().toISOString(), rescore: this.affectsRating(input) } as Op;
    if (!this.compact(op)) this.outbox.push(op);
    void this.persistOutbox();
    this.emit({ error: null });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), 300);
  }

  /** The AI rates title and steps, so only changes to those need a new rating. */
  private affectsRating(op: OpInput): string | undefined {
    const parentOf = (subtaskId: string) => this.view.subtasks.find((s) => s.id === subtaskId)?.task_id;
    switch (op.kind) {
      case "task.insert":
        return op.row.id;
      case "task.update":
        return op.patch.title !== undefined ? op.id : undefined;
      case "subtask.insert":
        return op.row.task_id;
      case "subtask.update":
        return op.patch.title !== undefined || op.patch.est_minutes !== undefined ? parentOf(op.id) : undefined;
      case "subtask.delete":
        return parentOf(op.id);
      default:
        return undefined;
    }
  }

  /** Folds a write into a pending insert of the same row, so offline edits sync as one request. */
  private compact(op: Op) {
    const pendingInsert = (kind: "task.insert" | "subtask.insert", id: string) =>
      this.outbox.findIndex((o) => o.kind === kind && o.row.id === id && o.opId !== this.inFlight);

    if (op.kind === "task.update" || op.kind === "subtask.update") {
      const i = pendingInsert(op.kind === "task.update" ? "task.insert" : "subtask.insert", op.id);
      if (i === -1) return false;
      const target = this.outbox[i] as Extract<Op, { row: unknown }>;
      this.outbox[i] = { ...target, row: { ...target.row, ...op.patch }, rescore: target.rescore ?? op.rescore } as Op;
      return true;
    }
    if (op.kind === "task.delete" || op.kind === "subtask.delete") {
      const i = pendingInsert(op.kind === "task.delete" ? "task.insert" : "subtask.insert", op.id);
      if (i === -1) return false;
      // Never reached the server: drop it and everything that touched it.
      this.outbox = this.outbox.filter(
        (o) =>
          o.opId === this.inFlight ||
          !(
            ("row" in o && (o.row.id === op.id || ("task_id" in o.row && o.row.task_id === op.id))) ||
            ("id" in o && o.id === op.id)
          ),
      );
      return true;
    }
    return false;
  }

  private persistOutbox() {
    return idb ? set(key(this.userId, "outbox"), this.outbox, idb) : Promise.resolve();
  }

  private setOnline(online: boolean) {
    this.emit({ online });
    if (online) void this.sync();
  }

  private async flush() {
    if (this.flushing || !navigator.onLine) return;
    this.flushing = true;
    this.emit({ syncing: true });
    try {
      while (this.outbox.length > 0) {
        const op = this.outbox[0];
        this.inFlight = op.opId;
        const error = await this.send(op);
        this.inFlight = null;
        if (isNetworkError(error)) break; // Try again when we're back online.
        this.outbox.shift();
        this.flushedSinceFetch++;
        if (!error && op.rescore) {
          this.toScore.add(op.rescore);
          this.scoreTried.delete(op.rescore);
        }
        if (error) {
          // The server refused it (validation or permissions). Roll it back.
          console.error("Rivl sync rejected", op, error);
          this.emit({ error: `Couldn't save ${describe(op)}. It has been undone.` });
        }
        await this.persistOutbox();
        this.emit();
      }
    } finally {
      this.inFlight = null;
      this.flushing = false;
      this.emit({ syncing: false });
    }
  }

  private async send(op: Op): Promise<{ code?: string; message: string } | null> {
    const db = this.supabase;
    const result =
      op.kind === "task.insert"
        ? await db.from("tasks").insert(op.row)
        : op.kind === "task.update"
          ? await db.from("tasks").update(op.patch).eq("id", op.id)
          : op.kind === "task.delete"
            ? await db.from("tasks").delete().eq("id", op.id)
            : op.kind === "subtask.insert"
              ? await db.from("subtasks").insert(op.row)
              : op.kind === "subtask.update"
                ? await db.from("subtasks").update(op.patch).eq("id", op.id)
                : await db.from("subtasks").delete().eq("id", op.id);
    const error = result.error;
    // A retried insert that already landed is a success.
    if (error?.code === "23505" && op.kind.endsWith(".insert")) return null;
    return error;
  }

  /** Asks the server to rate new or changed tasks, one at a time, and shows the result. */
  private async score() {
    if (this.scoring || !navigator.onLine) return;
    // Tasks that arrived unrated (e.g. created on another device) get one try per session.
    for (const t of this.snapshot.tasks) {
      if (t.difficulty === null && !t.completed_at && !this.scoreTried.has(t.id)) this.toScore.add(t.id);
    }
    this.scoring = true;
    try {
      for (const id of [...this.toScore]) {
        this.toScore.delete(id);
        this.scoreTried.add(id);
        // Still waiting to reach the server: it'll be queued again once it lands.
        if (this.outbox.some((o) => ("row" in o && o.row.id === id) || ("id" in o && o.id === id))) continue;
        const result = await ai.score(id);
        if (isAIError(result)) {
          if (result.error === "offline") this.toScore.add(id);
          continue;
        }
        this.snapshot = {
          ...this.snapshot,
          tasks: this.snapshot.tasks.map((t) => (t.id === id ? { ...t, difficulty: result.difficulty, difficulty_reason: result.reason } : t)),
        };
        // A task finished before it was rated has just had its points recalculated.
        if (this.snapshot.tasks.find((t) => t.id === id)?.completed_at) {
          const stats = await this.fetchStats();
          if (stats) this.snapshot = { ...this.snapshot, stats };
        }
        if (idb) await set(key(this.userId, "snapshot"), this.snapshot, idb);
        this.emit();
      }
    } finally {
      this.scoring = false;
    }
  }

  private async fetchStats(): Promise<Stats | undefined> {
    const db = this.supabase;
    const [profile, events, badges] = await Promise.all([
      db.from("profiles").select("streak_count, streak_last_on, streak_freezes, streak_best, weekly_goal").eq("id", this.userId).single(),
      // Friends' events are readable too (for the board), so filter to ours.
      db.from("point_events").select("task_id, type, amount, day").eq("user_id", this.userId).gte("week_start", weekStartISO()),
      db.from("user_achievements").select("achievement_id"),
    ]);
    if (profile.error || events.error || badges.error) return undefined;
    return { ...profile.data, events: events.data, badges: badges.data.map((b) => b.achievement_id), fetched_at: new Date().toISOString() };
  }

  private async fetch() {
    if (this.fetching || !navigator.onLine) return;
    this.fetching = true;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        this.flushedSinceFetch = 0;
        const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
        const [{ data, error }, stats] = await Promise.all([
          this.supabase
            .from("tasks")
            .select(`${TASK_COLUMNS}, subtasks(${SUBTASK_COLUMNS})`)
            .or(`completed_at.is.null,completed_at.gte.${since}`)
            .order("created_at"),
          this.fetchStats(),
        ]);
        if (error || !data) return;
        // Writes landed while we were reading; the result may already be stale.
        if (this.flushedSinceFetch > 0) continue;
        const rows = data as unknown as (Task & { subtasks: Subtask[] })[];
        this.snapshot = {
          tasks: rows.map((row) => {
            const task: Task & { subtasks?: Subtask[] } = { ...row };
            delete task.subtasks;
            return task;
          }),
          subtasks: rows.flatMap((r) => r.subtasks),
          fetchedAt: new Date().toISOString(),
          stats: stats ?? this.snapshot.stats,
        };
        if (idb) await set(key(this.userId, "snapshot"), this.snapshot, idb);
        this.emit();
        return;
      }
    } finally {
      this.fetching = false;
    }
  }
}

const stores = new Map<string, TaskStore>();

export function getTaskStore(userId: string) {
  let store = stores.get(userId);
  if (!store) {
    store = new TaskStore(userId);
    stores.set(userId, store);
  }
  return store;
}

export type { TaskStore };

/** Removes this device's cached tasks (on sign-out). Pending offline writes are lost. */
export async function clearTaskCache(userId: string) {
  if (!idb) return;
  await Promise.all([del(key(userId, "snapshot"), idb), del(key(userId, "outbox"), idb)]);
}
