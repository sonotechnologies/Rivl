"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { COACH_TINTS } from "@/components/brand/coach-bubble";
import { InviteCard } from "@/components/friends/invite-card";
import type { Profile } from "@/lib/auth";
import { ACCENTS, applyTheme, COACHES, type Accent, type CoachStyle, type Theme } from "@/lib/theme";
import { finishOnboarding } from "./actions";

const STEPS = 5; // Plus the invite screen at the end.

const DAY_STARTS = [
  { label: "5 am", value: "05:00" },
  { label: "6 am", value: "06:00" },
  { label: "7 am", value: "07:00" },
  { label: "8 am", value: "08:00" },
  { label: "9 am", value: "09:00" },
  { label: "Later", value: "10:00" },
];

const GOALS = [
  { pts: 300, label: "Casual", desc: "About 4 tasks a day" },
  { pts: 500, label: "Serious", desc: "Enough to fight for the podium" },
  { pts: 800, label: "Ruthless", desc: "You want the crown" },
];

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);

// The prototype's sel(): accent border and tint when chosen.
const choice = (on: boolean) =>
  on ? "border-[1.5px] border-accent bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface))]" : "border border-line bg-surface";

const stepLabel = "text-[0.8125rem] font-semibold text-accent-text";
const question = "font-display text-heading leading-[1.15] font-bold tracking-[-0.02em] text-pretty";

/** Five quick questions that personalise Rivl, then an invite. From the app prototype. */
export function OnboardingFlow({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.display_name ?? "");
  const [username, setUsername] = useState(profile.username ?? "");
  const [usernameTouched, setUsernameTouched] = useState(Boolean(profile.username));
  const [coach, setCoach] = useState<CoachStyle>(profile.coach_style);
  const [accent, setAccent] = useState<Accent>(profile.accent);
  const [theme, setTheme] = useState<Theme>(profile.theme);
  const [wake, setWake] = useState((profile.wake_time ?? "07:00").slice(0, 5));
  const [goal, setGoal] = useState(profile.weekly_goal ?? 500);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const handle = usernameTouched ? username : slug(name);

  function pickLook(next: { accent?: Accent; theme?: Theme }) {
    const a = next.accent ?? accent;
    const t = next.theme ?? theme;
    setAccent(a);
    setTheme(t);
    applyTheme(t, a); // Preview it live, everywhere.
  }

  function save(then: () => void) {
    startSaving(async () => {
      const result = await finishOnboarding({
        displayName: name,
        username: handle,
        coach,
        accent,
        theme,
        wakeTime: wake,
        weeklyGoal: goal,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!result.ok) {
        setError(result.error);
        setStep(result.step);
        return;
      }
      setError(null);
      then();
    });
  }

  const finish = () => {
    router.replace("/today");
    router.refresh();
  };


  function next() {
    if (step < STEPS - 1) return setStep(step + 1);
    save(() => setStep(STEPS)); // Last question answered: save, then the invite.
  }

  const canContinue = step !== 0 || name.trim().length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-11 items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          aria-label="Back"
          className={`grid size-11 place-items-center ${step === 0 || step === STEPS ? "invisible" : ""}`}
        >
          <span className="material-symbol text-2xl" aria-hidden>
            arrow_back
          </span>
        </button>
        <div className="flex items-center gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={Math.min(step + 1, STEPS)} aria-label="Onboarding progress">
          {Array.from({ length: STEPS }, (_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-[width] duration-200 ease-out ${i === step ? "w-5" : "w-2"} ${i <= step ? "bg-accent" : "bg-line"}`}
            />
          ))}
        </div>
        {step < STEPS ? (
          <button type="button" onClick={() => save(finish)} disabled={saving} className="h-11 px-1 text-body-sm font-medium text-muted">
            Skip
          </button>
        ) : (
          <span className="w-11" />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto pt-8 pb-4">
        {step === 0 ? (
          <>
            <div className={stepLabel}>Step 1 of 5</div>
            <h1 className={question}>What should your rivals call you?</h1>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-label="Your name"
              maxLength={40}
              autoComplete="given-name"
              autoFocus
              className="h-14 rounded-chip border-[1.5px] border-accent bg-surface px-4 text-title font-semibold outline-none"
            />
            <label className="flex items-center gap-1 rounded-chip border border-line bg-surface pl-4 focus-within:border-accent">
              <span className="text-muted">@</span>
              <input
                value={handle}
                onChange={(e) => {
                  setUsernameTouched(true);
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20));
                }}
                placeholder="username"
                aria-label="Username"
                autoCapitalize="none"
                className="h-12 flex-1 bg-transparent pr-4 text-body outline-none"
              />
            </label>
            <p className="text-body-sm text-muted">This is how you show up on the board. Friends find you by your username.</p>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className={stepLabel}>Step 2 of 5</div>
            <h1 className={question}>Pick your coach</h1>
            <div role="radiogroup" aria-label="Coach" className="flex flex-col gap-3">
              {COACHES.map((c) => {
                const { tint, pct, ink } = COACH_TINTS[c.id];
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={coach === c.id}
                    onClick={() => setCoach(c.id)}
                    className={`flex min-h-14 items-center gap-3 rounded-card p-3 text-left ${choice(coach === c.id)}`}
                  >
                    <span
                      className="grid size-10 flex-none place-items-center rounded-full"
                      style={{ background: `color-mix(in oklab, ${tint} ${pct + 8}%, var(--surface))`, color: ink }}
                      aria-hidden
                    >
                      <span className="material-symbol text-[1.375rem]">{c.icon}</span>
                    </span>
                    <span className="flex-1">
                      <span className="block text-body font-semibold">{c.name}</span>
                      <span className="mt-[3px] block text-body-sm text-pretty text-muted">{c.line}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className={stepLabel}>Step 3 of 5</div>
            <h1 className={question}>Pick your colour</h1>
            <div role="radiogroup" aria-label="Accent colour" className="grid grid-cols-3 gap-3">
              {ACCENTS.map((a) => {
                const on = accent === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickLook({ accent: a.id })}
                    className={`flex flex-col items-center gap-2.5 rounded-card px-2 py-4 ${choice(on)}`}
                  >
                    <span
                      className="size-11 rounded-full"
                      style={{ background: a.hex, boxShadow: on ? `0 0 20px 2px color-mix(in oklab, ${a.hex} 40%, transparent)` : "none" }}
                    />
                    <span className="text-body-sm font-semibold">{a.name}</span>
                  </button>
                );
              })}
            </div>
            <div role="radiogroup" aria-label="Mode" className="grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1">
              {(
                [
                  ["dark", "Dark", "dark_mode"],
                  ["light", "Light", "light_mode"],
                ] as const
              ).map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={theme === id}
                  onClick={() => pickLook({ theme: id })}
                  className={`flex min-h-11 items-center justify-center gap-1.5 rounded-full text-body-sm font-semibold ${theme === id ? "bg-accent text-on-accent" : "text-muted"}`}
                >
                  <span className="material-symbol text-lg" aria-hidden>
                    {icon}
                  </span>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2.5 rounded-card border border-line bg-surface px-4 py-3.5" aria-hidden>
              <span className="grid size-7 place-items-center rounded-full bg-accent text-on-accent">
                <span className="material-symbol text-lg [font-variation-settings:'wght'_700]">check</span>
              </span>
              <span className="flex-1 text-[0.9375rem] font-medium">Preview task</span>
              <span className="rounded-full bg-accent px-2.5 py-1 font-display text-[0.8125rem] font-bold text-on-accent">30</span>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className={stepLabel}>Step 4 of 5</div>
            <h1 className={question}>When does your day start?</h1>
            <div role="radiogroup" aria-label="Day starts at" className="flex flex-wrap gap-2.5">
              {DAY_STARTS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={wake === d.value}
                  onClick={() => setWake(d.value)}
                  className={`h-12 rounded-full px-5 text-[0.9375rem] font-semibold ${choice(wake === d.value)}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-body-sm text-muted">Plan my day starts from here, and your coach checks in around then.</p>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <div className={stepLabel}>Step 5 of 5</div>
            <h1 className={question}>Weekly points goal</h1>
            <div role="radiogroup" aria-label="Weekly goal" className="flex flex-col gap-3">
              {GOALS.map((g) => (
                <button
                  key={g.pts}
                  type="button"
                  role="radio"
                  aria-checked={goal === g.pts}
                  onClick={() => setGoal(g.pts)}
                  className={`flex items-center gap-3 rounded-card px-4 py-3.5 text-left ${choice(goal === g.pts)}`}
                >
                  <span className="w-[4.5rem] font-display text-heading font-bold tabular-nums">{g.pts}</span>
                  <span className="flex-1">
                    <span className="block text-body font-semibold">{g.label}</span>
                    <span className="mt-0.5 block text-[0.8125rem] text-muted">{g.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {step === STEPS ? (
          <>
            <span className="grid size-18 place-items-center rounded-sheet bg-accent text-on-accent" aria-hidden>
              <span className="material-symbol text-[2.5rem]">swords</span>
            </span>
            <h1 className={question}>Rivl needs a rival. Bring one.</h1>
            <p className="text-body text-pretty text-muted">
              Invite a friend. You both get +100 points when they join, and the board resets every Monday.
            </p>
            <InviteCard compact />
          </>
        ) : null}

        {error ? (
          <p role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>

      {step < STEPS ? (
        <button
          type="button"
          onClick={next}
          disabled={!canContinue || saving}
          className="h-14 rounded-full bg-accent text-body font-semibold text-on-accent disabled:opacity-50"
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      ) : (
        <div className="flex flex-col gap-2">

          <button type="button" onClick={finish} className="h-14 rounded-full border border-line text-body font-semibold">
            Done, let&apos;s go
          </button>
        </div>
      )}
    </div>
  );
}
