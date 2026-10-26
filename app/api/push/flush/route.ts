import { NextResponse, type NextRequest } from "next/server";
import { flushPushes } from "@/lib/push/send";
import { createClient } from "@/lib/supabase/server";

/*
 * Sends due pushes. Called by the app right after an action that notifies
 * someone (and when it opens), and every minute by a Supabase schedule with
 * `Authorization: Bearer $CRON_SECRET` (supabase/push-schedule.sql).
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bySchedule = Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!bySchedule) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  try {
    return NextResponse.json(await flushPushes());
  } catch (err) {
    console.error("Rivl: push flush failed", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
