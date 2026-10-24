import Link from "next/link";
import { CoachBubble } from "@/components/brand/coach-bubble";
import { Logo } from "@/components/brand/logo";
import { InstallPrompt } from "@/components/install-prompt";
import { ButtonLink } from "@/components/ui/button";

const POINTS = [
  { title: "Fair points", body: "AI rates every task 1 to 5. Hard tasks pay more. Farming doesn't." },
  { title: "Weekly board", body: "Your crew, ranked. Resets every Monday, so anyone can take #1." },
  { title: "Streaks and 1v1s", body: "Keep the flame alive. Challenge a friend to most points by Friday." },
];

// Logged-out landing. Signed-in visitors are sent to /today by proxy.ts.
export default function LandingPage() {
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <Logo size="2rem" />
        <ButtonLink href="/login" variant="ghost" className="min-h-11 px-4 text-body-sm">
          Sign in
        </ButtonLink>
      </header>

      <main className="flex flex-1 flex-col gap-10 pt-10 pb-12">
        <section className="flex flex-col gap-4">
          <h1 className="font-display text-hero font-bold tracking-[-0.02em] text-balance">
            Get it done. <span className="text-accent-text">Beat your friends.</span>
          </h1>
          <p className="text-body text-muted text-pretty">
            Add your tasks, finish them, earn points and climb your crew&apos;s weekly leaderboard. Free.
          </p>
        </section>

        <CoachBubble coach="hype">You&apos;re 40 pts behind Tobi. Fix that.</CoachBubble>

        <ul className="flex flex-col gap-3">
          {POINTS.map((p) => (
            <li key={p.title} className="rounded-card border border-line bg-surface p-4">
              <p className="font-display text-title font-bold tracking-[-0.02em]">{p.title}</p>
              <p className="mt-1 text-body-sm text-muted">{p.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-auto flex flex-col gap-3">
          <ButtonLink href="/login">Start free</ButtonLink>
          <div className="flex justify-center">
            <InstallPrompt />
          </div>
        </div>
      </main>

      <footer className="flex justify-center gap-4 border-t border-line py-4 text-caption text-muted">
        <Link href="/brand" className="hover:text-ink">
          Brand system
        </Link>
      </footer>
    </div>
  );
}
