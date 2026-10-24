import "server-only";
import { redirect } from "next/navigation";
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
};

const PROFILE_COLUMNS = "id, username, display_name, avatar_url, bio, timezone, coach_style, theme, accent, streak_count";

/**
 * Data access layer: the signed-in user's profile, or a redirect to /login.
 * Reads the request, so call it inside a <Suspense> boundary.
 */
export async function getCurrentProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", auth.user.id).single();
  if (error || !data) throw new Error("Could not load your profile.", { cause: error });
  return data as Profile;
}
