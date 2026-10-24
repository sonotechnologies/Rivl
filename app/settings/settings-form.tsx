"use client";

import { useActionState, useState, useTransition } from "react";
import { clearOfflineData } from "@/components/app/service-worker";
import { CoachBubble } from "@/components/brand/coach-bubble";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/auth";
import { ACCENTS, applyTheme, COACHES, THEMES, type Accent, type CoachStyle, type Theme } from "@/lib/theme";
import { saveProfile, savePreferences, type ProfileFormState } from "./actions";

const sectionTitle = "font-display text-title font-bold tracking-[-0.02em]";
const field =
  "min-h-11 w-full rounded-chip border border-line bg-surface px-4 text-body text-ink placeholder:text-muted focus:border-accent focus:outline-none";

export function SettingsForm({ profile }: { profile: Profile }) {
  const [theme, setTheme] = useState<Theme>(profile.theme);
  const [accent, setAccent] = useState<Accent>(profile.accent);
  const [coach, setCoach] = useState<CoachStyle>(profile.coach_style);
  const [goal, setGoal] = useState(profile.weekly_goal);
  const [shareDefault, setShareDefault] = useState(profile.share_by_default);
  const [prefError, setPrefError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [profileState, profileAction, savingProfile] = useActionState<ProfileFormState, FormData>(saveProfile, {
    error: null,
    saved: false,
  });

  function update(next: { theme?: Theme; accent?: Accent; coach_style?: CoachStyle }) {
    const t = next.theme ?? theme;
    const a = next.accent ?? accent;
    if (next.theme) setTheme(next.theme);
    if (next.accent) setAccent(next.accent);
    if (next.coach_style) setCoach(next.coach_style);
    applyTheme(t, a);
    startTransition(async () => {
      const { error } = await savePreferences(next);
      setPrefError(error);
    });
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4" aria-labelledby="appearance">
        <h2 id="appearance" className={sectionTitle}>
          Appearance
        </h2>

        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              onClick={() => update({ theme: t })}
              className={`min-h-11 rounded-full text-body-sm font-semibold capitalize transition-colors ${theme === t ? "bg-accent text-on-accent" : "text-muted hover:text-ink"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label="Accent colour" className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {ACCENTS.map((a) => {
            const selected = accent === a.id;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => update({ accent: a.id })}
                className="flex flex-col items-center gap-2 rounded-chip p-1 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span
                  className={`grid size-11 place-items-center rounded-full ${selected ? "ring-2 ring-ink ring-offset-2 ring-offset-bg" : ""}`}
                  style={{ background: a.hex, color: "#0B0B10" }}
                >
                  {selected ? (
                    <span className="material-symbol text-xl" aria-hidden>
                      check
                    </span>
                  ) : null}
                </span>
                <span className={`text-caption ${selected ? "font-semibold text-ink" : "text-muted"}`}>{a.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="coach">
        <h2 id="coach" className={sectionTitle}>
          Coach
        </h2>
        <div role="radiogroup" aria-label="Coach personality" className="flex flex-col gap-2">
          {COACHES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={coach === c.id}
              onClick={() => update({ coach_style: c.id })}
              className={`flex min-h-11 items-center justify-between rounded-chip border px-4 text-left text-body font-medium ${coach === c.id ? "border-accent bg-surface" : "border-line"}`}
            >
              {c.name}
              {coach === c.id ? (
                <span className="material-symbol text-xl text-accent-text" aria-label="Selected">
                  check
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <CoachBubble coach={coach}>{COACHES.find((c) => c.id === coach)!.line}</CoachBubble>
        {prefError ? (
          <p className="text-body-sm text-danger" role="alert">
            {prefError}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="your-day">
        <div>
          <h2 id="your-day" className={sectionTitle}>
            Your day
          </h2>
          <p className="mt-1 text-body-sm text-muted">Plan my day schedules tasks between these times.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["wake_time", "Wake up", profile.wake_time],
              ["sleep_time", "Wind down", profile.sleep_time],
            ] as const
          ).map(([key, text, value]) => (
            <label key={key} className="flex flex-col gap-1.5 text-body-sm font-medium">
              {text}
              <input
                type="time"
                defaultValue={value.slice(0, 5)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  startTransition(async () => {
                    const { error } = await savePreferences({ [key]: v });
                    setPrefError(error);
                  });
                }}
                className={field}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="goal">
        <h2 id="goal" className={sectionTitle}>
          Weekly goal
        </h2>
        <div role="radiogroup" aria-label="Weekly points goal" className="grid grid-cols-3 gap-2">
          {(
            [
              [300, "Casual"],
              [500, "Serious"],
              [800, "Ruthless"],
            ] as const
          ).map(([pts, label]) => (
            <button
              key={pts}
              type="button"
              role="radio"
              aria-checked={goal === pts}
              onClick={() => {
                setGoal(pts);
                startTransition(async () => {
                  const { error } = await savePreferences({ weekly_goal: pts });
                  setPrefError(error);
                });
              }}
              className={`flex flex-col items-center rounded-chip py-2.5 ${goal === pts ? "border-[1.5px] border-accent bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface))]" : "border border-line bg-surface"}`}
            >
              <span className="font-display text-title font-bold tabular-nums">{pts}</span>
              <span className="text-caption text-muted">{label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="privacy">
        <h2 id="privacy" className={sectionTitle}>
          Privacy
        </h2>
        <div className="flex items-start justify-between gap-4 rounded-card border border-line bg-surface p-4">
          <div>
            <p className="text-body font-semibold" id="share-default">
              Share wins by default
            </p>
            <p className="mt-1 text-body-sm text-muted">
              New tasks start shared, so friends see the title and points when you finish. You can still switch each task. Notes and steps are never shared.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={shareDefault}
            aria-labelledby="share-default"
            onClick={() => {
              const next = !shareDefault;
              setShareDefault(next);
              startTransition(async () => {
                const { error } = await savePreferences({ share_by_default: next });
                setPrefError(error);
              });
            }}
            className="grid h-11 w-14 flex-none place-items-center"
          >
            <span className={`relative h-7 w-12 rounded-full transition-colors ${shareDefault ? "bg-accent" : "bg-surface-2 ring-1 ring-line"}`}>
              <span className={`absolute top-0.5 size-6 rounded-full transition-[left] duration-150 ${shareDefault ? "left-[22px] bg-on-accent" : "left-0.5 bg-muted"}`} />
            </span>
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="profile">
        <h2 id="profile" className={sectionTitle}>
          Profile
        </h2>
        <form action={profileAction} className="flex flex-col gap-4">
          <input type="hidden" name="timezone" value={Intl.DateTimeFormat().resolvedOptions().timeZone} suppressHydrationWarning />
          <label className="flex flex-col gap-1.5 text-body-sm font-medium">
            Username
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">@</span>
              <input
                name="username"
                defaultValue={profile.username ?? ""}
                required
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_]{3,20}"
                autoCapitalize="none"
                autoComplete="username"
                className={`${field} pl-8`}
              />
            </div>
          </label>
          <label className="flex flex-col gap-1.5 text-body-sm font-medium">
            Name
            <input name="display_name" defaultValue={profile.display_name ?? ""} maxLength={40} className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-body-sm font-medium">
            Bio
            <input
              name="bio"
              defaultValue={profile.bio ?? ""}
              maxLength={120}
              placeholder="One line. Make it count."
              className={field}
            />
          </label>
          <Button type="submit" disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save profile"}
          </Button>
          <p className="min-h-5 text-body-sm" role="status">
            {profileState.error ? (
              <span className="text-danger">{profileState.error}</span>
            ) : profileState.saved ? (
              <span className="text-muted">Saved.</span>
            ) : null}
          </p>
        </form>
      </section>

      <form
        action="/auth/signout"
        method="post"
        onSubmit={async (e) => {
          // Clear this device's offline copies first, then let the form post.
          e.preventDefault();
          const form = e.currentTarget;
          await clearOfflineData().catch(() => {});
          form.submit();
        }}
      >
        <Button type="submit" variant="ghost" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
