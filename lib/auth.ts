import "server-only";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Accent, CoachStyle, Theme } from "@/lib/theme";

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  timezone: string;
  coach_style: CoachStyle;
  theme: Theme;
  accent: Accent;
  streak_count: number;
  /** HH:MM:SS; the day Plan my day schedules within. */
  wake_time: string;
  sleep_time: string;
  weekly_goal: number;
  onboarded_at: string | null;
};

const PROFILE_COLUMNS = "id, username, display_name, avatar_url, bio, timezone, coach_style, theme, accent, streak_count, wake_time, sleep_time, weekly_goal, onboarded_at";

/** Postgres/PostgREST codes that mean the database is missing a migration. */
const SCHEMA_CODES = new Set(["42703", "42P01", "42883", "PGRST200", "PGRST202", "PGRST204"]);

/** Why the profile couldn't be loaded, in a form the setup screen can explain. */
export class ProfileLoadError extends Error {
  constructor(
    public kind: "schema" | "other",
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/**
 * Data access layer: the signed-in user's profile, or a redirect to /login.
 * Reads the request, so call it inside a <Suspense> boundary.
 */
export async function getCurrentProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const read = () => supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", auth.user!.id).maybeSingle();
  let { data, error } = await read();

  // Accounts created before the profiles table existed have no row: make one.
  if (!error && !data) {
    const meta = auth.user.user_metadata ?? {};
    const name = (meta.full_name ?? meta.name ?? auth.user.email?.split("@")[0] ?? null) as string | null;
    let admin;
    try {
      admin = createAdminClient();
    } catch {
      throw new ProfileLoadError("other", "Your account has no profile yet, and SUPABASE_SECRET_KEY isn't set in Vercel, so Rivl can't create one. Add it and redeploy.");
    }
    // Return the new row from the insert itself: Next.js memoises identical GETs
    // within a render, so reading again would just replay the empty first answer.
    const created = await admin
      .from("profiles")
      .insert({ id: auth.user.id, display_name: name?.slice(0, 40) ?? null, avatar_url: meta.avatar_url ?? null })
      .select(PROFILE_COLUMNS)
      .single();
    if (created.error) {
      console.error("Rivl: couldn't create missing profile", created.error);
      throw new ProfileLoadError(SCHEMA_CODES.has(created.error.code) ? "schema" : "other", created.error.message, created.error.code);
    }
    ({ data, error } = created);
  }

  if (error || !data) {
    console.error("Rivl: couldn't load profile", error);
    throw new ProfileLoadError(error && SCHEMA_CODES.has(error.code) ? "schema" : "other", error?.message ?? "Profile not found", error?.code);
  }
  return data as Profile;
}

/** Like getCurrentProfile, but hands back the problem instead of throwing, so pages can explain it. */
export async function loadProfile(): Promise<{ profile: Profile; problem?: never } | { profile?: never; problem: ProfileLoadError }> {
  try {
    return { profile: await getCurrentProfile() };
  } catch (err) {
    if (err instanceof ProfileLoadError) return { problem: err };
    throw err; // Redirects and anything unexpected.
  }
}
