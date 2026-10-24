"use client";

/** Last-resort screen for anything unexpected on the signed-in tabs. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4 py-6">
      <h1 className="font-display text-heading font-bold tracking-[-0.02em]">Something went wrong</h1>
      <p className="text-body text-muted">Try again. If it keeps happening, the reference below helps find it in the logs.</p>
      {error.digest ? <p className="font-mono text-caption text-muted">Ref {error.digest}</p> : null}
      <button type="button" onClick={reset} className="min-h-11 rounded-full bg-accent px-5 font-semibold text-on-accent">
        Try again
      </button>
    </div>
  );
}
