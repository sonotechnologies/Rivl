"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp, useTasks } from "@/components/app/app-context";
import { ButtonLink } from "@/components/ui/button";
import { BADGES } from "@/lib/badges";
import { addDays, todayISO, weekStartISO } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";

type MyStats = { total_points: number; tasks_done: number; days: { day: string; count: number }[] };

const WEEKS = 18;
const heatColour = (level: number) =>
  level === 0 ? "var(--surface-2)" : `color-mix(in oklab, var(--accent) ${[0, 30, 55, 78, 100][level]}%, var(--surface-2))`;

/** Profile from the design: who you are, big stats, streak calendar and badges. */
export function MeScreen() {
  const { profile } = useApp();
  const { stats, online } = useTasks();
  const [mine, setMine] = useState<MyStats | null>(null);

  useEffect(() => {
    if (!online) return;
    void createClient()
      .rpc("my_stats")
      .then(({ data }) => data && setMine(data as MyStats));
  }, [online, stats]);

  const name = profile.display_name ?? profile.username ?? "You";
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // 18 weeks of days, Monday first, ending this week. Future days stay empty.
  const today = todayISO();
  const start = addDays(weekStartISO(today), -7 * (WEEKS - 1));
  const counts = new Map(mine?.days.map((d) => [d.day, d.count]));
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const day = addDays(start, i);
    return { day, future: day > today, level: Math.min(4, counts.get(day) ?? 0) };
  });

  const earned = new Set(stats?.badges ?? []);
  const statTiles = [
    { label: "Total pts", value: mine ? mine.total_points.toLocaleString("en-GB") : "–" },
    { label: "Best streak", value: stats ? String(stats.streak_best) : "–" },
    { label: "Wins", value: "0" },
  ];

  return (
    <div className="grid auto-rows-max grid-cols-[minmax(0,1fr)] gap-3">
      <header className="-mb-2 flex justify-end">
        <Link href="/settings" aria-label="Settings" className="-mr-2 grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
          <span className="material-symbol text-2xl" aria-hidden>
            settings
          </span>
        </Link>
      </header>
      <section className="flex flex-col items-center gap-1.5 pb-2 text-center">
        <span className="grid size-[88px] place-items-center rounded-full bg-[color-mix(in_oklab,var(--accent)_22%,var(--surface))] font-display text-heading font-bold text-accent-text shadow-[0_0_0_3px_var(--bg),0_0_0_5px_var(--accent)]">
          {initials}
        </span>
        <h1 className="mt-2.5 font-display text-heading font-bold tracking-[-0.02em]">{name}</h1>
        {profile.username ? <p className="text-body-sm font-medium text-muted">@{profile.username}</p> : null}
        {profile.bio ? <p className="max-w-[280px] text-[0.9375rem] leading-[1.4] text-pretty">{profile.bio}</p> : null}
      </section>

      {profile.username ? null : (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <p className="text-body">Pick a username so friends can find you.</p>
          <ButtonLink href="/settings" variant="outline">
            Set username
          </ButtonLink>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {statTiles.map((s) => (
          <div key={s.label} className="rounded-card border border-line bg-surface px-3 py-3.5">
            <div className="font-display text-heading leading-none font-bold tabular-nums">{s.value}</div>
            <div className="mt-1.5 text-caption font-medium text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4" aria-labelledby="calendar">
        <div className="flex items-baseline justify-between">
          <h2 id="calendar" className="text-[0.9375rem] font-semibold">
            Streak calendar
          </h2>
          <span className="text-caption font-medium text-muted">Last {WEEKS} weeks</span>
        </div>
        <div className="grid grid-flow-col grid-rows-7 gap-[3px] [grid-auto-columns:1fr]" role="img" aria-label={`Tasks finished per day over the last ${WEEKS} weeks`}>
          {cells.map((c) => (
            <span
              key={c.day}
              className={`aspect-square rounded-[3px] ${c.future ? "border border-dashed border-line" : ""} ${c.day === today ? "ring-[1.5px] ring-ink ring-inset" : ""}`}
              style={{ background: c.future ? "transparent" : heatColour(c.level) }}
            />
          ))}
        </div>
        <div className="flex items-center justify-end gap-1 text-[0.6875rem] font-medium text-muted" aria-hidden>
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className="size-2.5 rounded-[2px]" style={{ background: heatColour(l) }} />
          ))}
          More
        </div>
        {!online && !mine ? <p className="text-caption text-muted">Stats load when you&apos;re online.</p> : null}
      </section>

      <div className="flex items-baseline justify-between px-1 pt-2">
        <h2 className="text-caption font-semibold tracking-[0.06em] text-muted uppercase">Badges</h2>
        <span className="text-caption font-medium text-muted">
          {earned.size} of {BADGES.length}
        </span>
      </div>
      <ul className="grid grid-cols-4 gap-2">
        {BADGES.map((b) => {
          const on = earned.has(b.id);
          return (
            <li key={b.id} className="flex flex-col items-center gap-1.5 rounded-card border border-line bg-surface px-1 py-3 text-center">
              <span
                className={`relative grid size-13 place-items-center rounded-full ${on ? "bg-accent text-on-accent" : "bg-surface-2 text-muted opacity-55"}`}
                aria-hidden
              >
                <span className="material-symbol text-[1.625rem]">{b.icon}</span>
                {on ? null : (
                  <span className="material-symbol absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border-2 border-surface bg-surface-2 text-xs text-muted">
                    lock
                  </span>
                )}
              </span>
              <span className={`text-[0.6875rem] leading-[1.2] font-semibold ${on ? "text-ink" : "text-muted"}`}>{b.name}</span>
              <span className="sr-only">
                {on ? "Earned" : "Locked"}: {b.description}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex flex-col gap-2">
        <ButtonLink href="/friends">
          <span className="material-symbol text-xl" aria-hidden>
            group
          </span>
          Friends
        </ButtonLink>
        <ButtonLink href="/settings" variant="ghost">
          Settings
        </ButtonLink>
        <Link href="/onboarding" className="flex min-h-11 items-center justify-center text-body-sm font-medium text-muted hover:text-ink">
          Replay onboarding
        </Link>
      </div>
    </div>
  );
}
