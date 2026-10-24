import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ThemeSync } from "@/components/theme-sync";
import { SetupProblem } from "@/components/app/setup-problem";
import { loadProfile } from "@/lib/auth";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 pt-4 pb-12">
      <header className="flex items-center gap-2">
        <Link
          href="/me"
          aria-label="Back to Me"
          className="-ml-2 grid size-11 place-items-center rounded-full text-ink hover:bg-surface-2"
        >
          <span className="material-symbol text-2xl" aria-hidden>
            chevron_left
          </span>
        </Link>
        <h1 className="font-display text-heading font-bold tracking-[-0.02em]">Settings</h1>
      </header>
      <Suspense fallback={<SettingsSkeleton />}>
        <Settings />
      </Suspense>
    </main>
  );
}

async function Settings() {
  const { profile, problem } = await loadProfile();
  if (problem) return <SetupProblem problem={problem} />;
  return (
    <>
      <ThemeSync theme={profile.theme} accent={profile.accent} />
      <SettingsForm profile={profile} />
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="h-7 w-32 animate-pulse rounded-chip bg-surface-2" />
      <div className="h-13 animate-pulse rounded-full bg-surface" />
      <div className="h-24 animate-pulse rounded-card bg-surface" />
      <div className="h-7 w-24 animate-pulse rounded-chip bg-surface-2" />
      <div className="h-40 animate-pulse rounded-card bg-surface" />
    </div>
  );
}
