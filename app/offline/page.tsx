import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Offline" };

// Served by the service worker when a screen you haven't opened before is requested offline.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo size="2.5rem" />
      <h1 className="font-display text-heading font-bold tracking-[-0.02em]">You&apos;re offline</h1>
      <p className="max-w-[300px] text-body text-muted text-pretty">
        This screen needs a connection the first time. Your Today list still works offline once you&apos;ve opened it.
      </p>
      <a href="/today" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-display font-bold text-on-accent">
        Go to Today
      </a>
    </main>
  );
}
