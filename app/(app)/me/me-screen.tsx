"use client";

import Link from "next/link";
import { useApp } from "@/components/app/app-context";
import { ButtonLink } from "@/components/ui/button";

// Profile basics. Stats, streak calendar and badges arrive with points (build step 4).
export function MeScreen() {
  const { profile } = useApp();
  const name = profile.display_name ?? profile.username ?? "You";
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col gap-6 pt-1">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-heading font-bold tracking-[-0.02em]">Me</h1>
        <Link href="/settings" aria-label="Settings" className="-mr-2 grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
          <span className="material-symbol text-2xl" aria-hidden>
            settings
          </span>
        </Link>
      </header>
      <section className="flex items-center gap-4">
        <div className="grid size-18 flex-none place-items-center rounded-full bg-[color-mix(in_oklab,var(--accent)_20%,var(--surface))] font-display text-title font-bold text-accent-text">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-title font-bold">{name}</p>
          {profile.username ? <p className="text-body-sm text-muted">@{profile.username}</p> : null}
          {profile.bio ? <p className="mt-1 text-body-sm text-pretty">{profile.bio}</p> : null}
        </div>
      </section>
      {profile.username ? null : (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <p className="text-body">Pick a username so friends can find you.</p>
          <ButtonLink href="/settings" variant="outline">
            Set username
          </ButtonLink>
        </div>
      )}
      <ButtonLink href="/settings" variant="ghost">
        Settings
      </ButtonLink>
    </div>
  );
}
