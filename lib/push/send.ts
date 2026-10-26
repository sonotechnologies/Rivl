import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Sends whatever is due in push_queue (supabase/migrations/20261024900000_push.sql).
 * The database decides what's due, applies the 5-a-day cap and marks each push
 * sent as it's claimed, so overlapping flushes never double-send.
 */

type Claimed = { id: string; user_id: string; kind: string; title: string; body: string; url: string };
type Subscription = { endpoint: string; user_id: string; p256dh: string; auth: string };

const URGENT = new Set(["nudge", "challenge"]);

export const pushConfigured = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export async function flushPushes(limit = 100) {
  if (!pushConfigured()) return { sent: 0, failed: 0, disabled: true };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@rivl.app", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

  const admin = createAdminClient();
  const { data: due, error } = await admin.rpc("claim_pushes", { p_limit: limit });
  if (error) throw error;
  const pushes = (due ?? []) as Claimed[];
  if (!pushes.length) return { sent: 0, failed: 0 };

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, user_id, p256dh, auth")
    .in("user_id", [...new Set(pushes.map((p) => p.user_id))]);
  const devices = (subs ?? []) as Subscription[];

  const gone: string[] = [];
  const ok: string[] = [];
  let failed = 0;
  await Promise.all(
    pushes.flatMap((p) =>
      devices
        .filter((d) => d.user_id === p.user_id)
        .map(async (d) => {
          try {
            await webpush.sendNotification(
              { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
              JSON.stringify({ title: p.title, body: p.body, url: p.url, tag: p.kind }),
              { TTL: 12 * 3600, urgency: URGENT.has(p.kind) ? "high" : "normal", timeout: 10_000 },
            );
            ok.push(d.endpoint);
          } catch (err) {
            failed++;
            // 404/410: the browser unsubscribed or the app was removed.
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) gone.push(d.endpoint);
          }
        }),
    ),
  );
  await Promise.all([
    gone.length ? admin.from("push_subscriptions").delete().in("endpoint", gone) : null,
    ok.length ? admin.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).in("endpoint", [...new Set(ok)]) : null,
  ]);
  return { sent: ok.length, failed, removed: gone.length };
}
