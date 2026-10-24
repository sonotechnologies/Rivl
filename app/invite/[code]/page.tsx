import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { Avatar } from "@/components/friends/avatar";
import { ButtonLink } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { JoinButton } from "./join-button";

export const metadata: Metadata = {
  title: "You've been challenged",
  description: "A friend wants you as their rival on Rivl. Get it done. Beat your friends.",
};

// Public landing for an invite link. Works signed out; joining needs an account.
export default function InvitePage({ params, searchParams }: PageProps<"/invite/[code]">) {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-8 px-4 pt-4 pb-10">
      <Link href="/" aria-label="Rivl home" className="self-start py-2">
        <Logo size="2rem" />
      </Link>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-card bg-surface" aria-busy="true" />}>
        <Invite params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Invite({ params, searchParams }: Pick<PageProps<"/invite/[code]">, "params" | "searchParams">) {
  const { code } = await params;
  const join = (await searchParams).join === "1";
  const supabase = await createClient();
  const [{ data: rows }, { data: auth }] = await Promise.all([
    supabase.rpc("invite_lookup", { p_code: code }),
    supabase.auth.getUser(),
  ]);
  const inviter = (rows as { display_name: string | null; username: string | null; accent: string; streak_count: number }[] | null)?.[0];

  if (!inviter) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-heading font-bold tracking-[-0.02em]">This invite link doesn&apos;t work</h1>
        <p className="text-body text-muted">Ask your friend to send it again, or start on your own and add them later.</p>
        <ButtonLink href="/">Find out about Rivl</ButtonLink>
      </div>
    );
  }

  const name = inviter.display_name ?? inviter.username ?? "A friend";
  const first = name.split(" ")[0];

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col items-center gap-4 rounded-card border border-line bg-surface px-5 py-8 text-center">
        <div className="flex items-center gap-3" aria-hidden>
          <Avatar name={name} accent={inviter.accent} size={72} />
          <span className="font-display text-title font-bold text-muted">vs</span>
          <span className="grid size-[72px] place-items-center rounded-full border-2 border-dashed border-line font-display text-heading font-bold text-muted">
            ?
          </span>
        </div>
        <h1 className="font-display text-heading leading-[1.15] font-bold tracking-[-0.02em] text-balance">
          {first} wants you as their rival
        </h1>
        <p className="text-body text-pretty text-muted">
          Rivl turns your to-do list into a weekly race between friends. Join now and you both start with <span className="font-semibold text-ink">+100 points</span>.
        </p>
        {inviter.streak_count > 0 ? (
          <p className="text-body-sm font-medium text-balance">
            <span className="material-symbol mr-1 inline-block bg-linear-0 from-[#FF7A1A] to-[#FFC93D] bg-clip-text align-[-4px] text-lg text-transparent" aria-hidden>
              local_fire_department
            </span>
            {first} is on a {inviter.streak_count}-day streak. Fancy breaking it?
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        {auth.user ? (
          <JoinButton code={code} name={first} auto={join} />
        ) : (
          <>
            <ButtonLink href={`/login?next=${encodeURIComponent(`/invite/${code}?join=1`)}`} className="h-14">
              Join {first} on Rivl
            </ButtonLink>
            <p className="text-center text-caption text-muted">Free. No passwords, just an email link.</p>
          </>
        )}
      </div>
    </div>
  );
}
