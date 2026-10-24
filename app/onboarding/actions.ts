"use server";

import { createClient } from "@/lib/supabase/server";
import { isAccent, isCoach, isTheme, type Accent, type CoachStyle, type Theme } from "@/lib/theme";

export type OnboardingInput = {
  displayName: string;
  username: string;
  coach: CoachStyle;
  accent: Accent;
  theme: Theme;
  wakeTime: string;
  weeklyGoal: number;
  timezone: string;
};

export type OnboardingResult = { ok: true } | { ok: false; error: string; step: number };

const GOALS = [300, 500, 800];

function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Saves every onboarding choice at once and marks onboarding done. */
export async function finishOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "You're signed out. Sign in again.", step: 0 };

  const displayName = input.displayName.trim().slice(0, 40);
  const username = input.username.trim().toLowerCase();
  if (username && !/^[a-z0-9_]{3,20}$/.test(username)) {
    return { ok: false, error: "Usernames are 3–20 characters: letters, numbers and _.", step: 0 };
  }

  const values: Record<string, unknown> = { onboarded_at: new Date().toISOString() };
  if (displayName) values.display_name = displayName;
  if (username) values.username = username;
  if (isCoach(input.coach)) values.coach_style = input.coach;
  if (isAccent(input.accent)) values.accent = input.accent;
  if (isTheme(input.theme)) values.theme = input.theme;
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(input.wakeTime)) values.wake_time = input.wakeTime;
  if (GOALS.includes(input.weeklyGoal)) values.weekly_goal = input.weeklyGoal;
  if (input.timezone && isTimeZone(input.timezone)) values.timezone = input.timezone;

  const { error } = await supabase.from("profiles").update(values).eq("id", data.user.id);
  if (error?.code === "23505") return { ok: false, error: "That username is taken. Try another.", step: 0 };
  if (error) return { ok: false, error: "Couldn't save. Try again.", step: 4 };
  return { ok: true };
}
