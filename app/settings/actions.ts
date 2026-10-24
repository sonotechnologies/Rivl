"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAccent, isCoach, isTheme, type Accent, type CoachStyle, type Theme } from "@/lib/theme";

function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type Preferences =Partial<{ theme: Theme; accent: Accent; coach_style: CoachStyle }>;

async function updateOwnProfile(values: Record<string, unknown>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "You're signed out. Sign in again." };
  const { error } = await supabase.from("profiles").update(values).eq("id", data.user.id);
  return { error: error?.code === "23505" ? "That username is taken." : error ? "Couldn't save. Try again." : null };
}

export async function savePreferences(prefs: Preferences) {
  const values: Preferences = {};
  if (isTheme(prefs.theme)) values.theme = prefs.theme;
  if (isAccent(prefs.accent)) values.accent = prefs.accent;
  if (isCoach(prefs.coach_style)) values.coach_style = prefs.coach_style;
  if (Object.keys(values).length === 0) return { error: "Nothing to save." };
  return updateOwnProfile(values);
}

export type ProfileFormState = { error: string | null; saved: boolean };

export async function saveProfile(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const displayName = String(form.get("display_name") ?? "").trim();
  const bio = String(form.get("bio") ?? "").trim();
  const timezone = String(form.get("timezone") ?? "").trim();

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return { error: "Usernames are 3–20 characters: letters, numbers and _.", saved: false };
  }
  if (displayName.length > 40) return { error: "Keep your name under 40 characters.", saved: false };
  if (bio.length > 120) return { error: "Keep your bio under 120 characters.", saved: false };

  const values: Record<string, string | null> = { username, display_name: displayName || null, bio: bio || null };
  if (timezone && isTimeZone(timezone)) values.timezone = timezone;

  const { error } = await updateOwnProfile(values);
  if (!error) refresh();
  return { error, saved: !error };
}
