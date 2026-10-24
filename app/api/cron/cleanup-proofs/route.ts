import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Daily (vercel.json): deletes photo proof older than 7 days, plus photos whose
 * post was removed. Posts keep their "verified" tick and points.
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ data: old }, { data: trash }] = await Promise.all([
    admin.from("feed_posts").select("id, photo_path").not("photo_path", "is", null).lt("created_at", cutoff).limit(500),
    admin.from("proof_trash").select("path").limit(500),
  ]);
  const paths = [...(old ?? []).map((p) => p.photo_path as string), ...(trash ?? []).map((t) => t.path as string)];
  if (paths.length) {
    const { error } = await admin.storage.from("proofs").remove(paths);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (old?.length) await admin.from("feed_posts").update({ photo_path: null }).in("id", old.map((p) => p.id));
  if (trash?.length) await admin.from("proof_trash").delete().in("path", trash.map((t) => t.path));
  return NextResponse.json({ removed: paths.length });
}
