import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CoachBubble } from "@/components/brand/coach-bubble";
import { Logo } from "@/components/brand/logo";
import { ThemeSync } from "@/components/theme-sync";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/auth";
import { COACHES } from "@/lib/theme";

export const metadata: Metadata = { title: "Today" };

// Foundation placeholder for the Today tab. Tasks arrive in build step 2.
export default function TodayPage() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 pt-4 pb-12">
      <header className="flex items-center justify-between">
        <Logo size="1.75rem" />
        <Link
          href="/settings"
          aria-label="Settings"
          className="-mr-2 grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
        >
          <span className="material-symbol text-2xl" aria-hidden>
            settings
          </span>
        </Link>
      </header>
      <Suspense fallback={<TodaySkeleton />}>
        <Today />
      </Suspense>
    </main>
  );
}

async function Today() {
  const profile = await getCurrentProfile();
  const name = profile.display_name ?? profile.username ?? "you";
  const coach = COACHES.find((c) => c.id === profile.coach_style)!;
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: profile.timezone,
  }).format(new Date());

  return (
    <>
      <ThemeSync theme={profile.theme} accent={profile.accent} />
      <section className="flex flex-col gap-1">
        <p className="text-body-sm text-muted">{date}</p>
        <h1 className="font-display text-heading font-bold tracking-[-0.02em]">Hey, {name}</h1>
      </section>
      <CoachBubble coach={coach.id}>{coach.line}</CoachBubble>
      {profile.username ? null : (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <p className="text-body">Pick a username so friends can find you.</p>
          <ButtonLink href="/settings" variant="outline">
            Set username
          </ButtonLink>
        </div>
      )}
      <p className="rounded-card border border-dashed border-line p-4 text-body-sm text-muted">
        Your tasks show up here once the task list ships.
      </p>
    </>
  );
}

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-40 animate-pulse rounded-chip bg-surface-2" />
        <div className="h-8 w-48 animate-pulse rounded-chip bg-surface-2" />
      </div>
      <div className="h-20 animate-pulse rounded-card bg-surface" />
    </div>
  );
}
