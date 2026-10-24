import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { AIUnavailableError } from "@/lib/ai/provider";
import { breakDown, planDay, scoreDifficulty, type PlanTask } from "@/lib/ai/features";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isCoach } from "@/lib/theme";

/*
 * The single AI endpoint from the build brief. Every request is tied to the
 * signed-in user; ratings and quotas are written with the service key so
 * clients can't set them. Breakdown and Plan my day use the daily allowance;
 * scoring is free but cached per task, so edits that don't change the task
 * never re-bill.
 */

const DAILY_LIMIT = 10;
const MAX_RESCORES = 5;
const FALLBACK_DIFFICULTY = 2;

type Body =
  | { action: "score"; taskId: string }
  | { action: "breakdown"; title: string; notes?: string | null }
  | { action: "plan" }
  | { action: "quota" };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const unavailable = () => json({ error: "unavailable", message: "The coach is taking a breather. Try again in a minute." }, 503);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return json({ error: "unauthorised" }, 401);

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const admin = createAdminClient();

  async function spendAction() {
    const { data, error } = await admin.rpc("consume_ai_action", { p_user: user!.id, p_limit: DAILY_LIMIT });
    if (error) throw error;
    return data as number;
  }
  async function refundAction() {
    const { data } = await admin.from("profiles").select("ai_actions_today").eq("id", user!.id).single();
    if (data?.ai_actions_today) await admin.from("profiles").update({ ai_actions_today: data.ai_actions_today - 1 }).eq("id", user!.id);
  }
  const limitReached = () =>
    json({ error: "limit", message: `That's your ${DAILY_LIMIT} AI actions for today. They reset at midnight.`, remaining: 0 }, 429);

  switch (body.action) {
    case "quota": {
      const { data } = await admin.rpc("ai_actions_left", { p_user: user.id, p_limit: DAILY_LIMIT });
      return json({ remaining: data ?? DAILY_LIMIT, limit: DAILY_LIMIT });
    }

    case "score": {
      if (!UUID.test(body.taskId)) return json({ error: "bad_request" }, 400);
      const { data: task } = await admin
        .from("tasks")
        .select("id, title, created_at, difficulty, difficulty_reason, difficulty_input_hash, ai_score_count, subtasks(title, est_minutes, position)")
        .eq("id", body.taskId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!task) return json({ error: "not_found" }, 404);

      const steps = [...(task.subtasks ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ title: s.title as string, minutes: s.est_minutes as number | null }));
      const hash = createHash("sha256")
        .update(JSON.stringify([normalise(task.title), steps.map((s) => [normalise(s.title), s.minutes])]))
        .digest("hex");

      const current = { difficulty: task.difficulty, reason: task.difficulty_reason };
      if (task.difficulty && task.difficulty_input_hash === hash) return json({ ...current, cached: true });
      if (task.difficulty && task.ai_score_count >= MAX_RESCORES) return json({ ...current, cached: true });

      const save = async (difficulty: number, reason: string, inputHash: string | null) => {
        await admin
          .from("tasks")
          .update({ difficulty, difficulty_reason: reason, difficulty_input_hash: inputHash, ai_score_count: task.ai_score_count + (inputHash ? 1 : 0) })
          .eq("id", task.id)
          .eq("user_id", user.id);
        return json({ difficulty, reason });
      };

      // Anti-farming: the same task twice in a day scores as difficulty 1.
      const dayStart = new Date(new Date(task.created_at).getTime() - 86_400_000).toISOString();
      const { data: siblings } = await admin
        .from("tasks")
        .select("id, title")
        .eq("user_id", user.id)
        .neq("id", task.id)
        .gte("created_at", dayStart)
        .lte("created_at", task.created_at)
        .is("series_id", null);
      if (siblings?.some((s) => normalise(s.title) === normalise(task.title))) {
        return save(1, "Looks like a repeat of another task today.", hash);
      }

      try {
        const rating = await scoreDifficulty({ title: task.title, steps });
        if ("refused" in rating) return save(1, "Rivl can't help with this one.", hash);
        return save(rating.difficulty, rating.reason, hash);
      } catch (err) {
        if (!(err instanceof AIUnavailableError)) throw err;
        // Fall back to 2 and leave the hash empty so the next edit tries again.
        if (task.difficulty) return json({ ...current, cached: true });
        return save(FALLBACK_DIFFICULTY, "Couldn't rate this right now, so it's set to 2.", null);
      }
    }

    case "breakdown": {
      const title = typeof body.title === "string" ? body.title.trim().slice(0, 140) : "";
      if (!title) return json({ error: "bad_request" }, 400);
      const remaining = await spendAction();
      if (remaining < 0) return limitReached();
      try {
        const result = await breakDown({ title, notes: typeof body.notes === "string" ? body.notes : null });
        if ("refused" in result) {
          await refundAction();
          return json({ error: "refused", message: "That's not one Rivl can help break down." }, 422);
        }
        return json({ steps: result.steps, remaining });
      } catch (err) {
        if (!(err instanceof AIUnavailableError)) throw err;
        await refundAction();
        return unavailable();
      }
    }

    case "plan": {
      const { data: profile } = await admin
        .from("profiles")
        .select("timezone, wake_time, sleep_time, coach_style")
        .eq("id", user.id)
        .single();
      if (!profile) return json({ error: "not_found" }, 404);
      const tz = profile.timezone || "UTC";
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
          .formatToParts(new Date())
          .map((p) => [p.type, p.value]),
      );
      const today = `${parts.year}-${parts.month}-${parts.day}`;
      const now = `${parts.hour}:${parts.minute}`;

      const { data: rows } = await admin
        .from("tasks")
        .select("id, title, difficulty, due_on, due_time, subtasks(est_minutes, done)")
        .eq("user_id", user.id)
        .is("completed_at", null)
        .lte("due_on", today)
        .order("due_on")
        .limit(20);
      if (!rows?.length) return json({ error: "nothing", message: "Nothing due today. Add a few tasks first." }, 422);

      const tasks: PlanTask[] = rows.map((t) => ({
        id: t.id,
        title: t.title,
        difficulty: t.difficulty,
        dueTime: t.due_time,
        overdue: t.due_on < today,
        minutes: (t.subtasks ?? []).filter((s) => !s.done).reduce((n, s) => n + (s.est_minutes ?? 0), 0) || null,
      }));

      const remaining = await spendAction();
      if (remaining < 0) return limitReached();
      try {
        const plan = await planDay({
          now,
          wake: String(profile.wake_time).slice(0, 5),
          sleep: String(profile.sleep_time).slice(0, 5),
          coach: isCoach(profile.coach_style) ? profile.coach_style : "hype",
          tasks,
        });
        return json({ ...plan, remaining, today });
      } catch (err) {
        if (!(err instanceof AIUnavailableError)) throw err;
        await refundAction();
        return unavailable();
      }
    }

    default:
      return json({ error: "bad_request" }, 400);
  }
}
