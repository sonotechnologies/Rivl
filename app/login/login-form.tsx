"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

export function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [status, setStatus] = useState<Status>(
    params.get("error") ? { kind: "error", message: "That sign-in link didn't work. Try again." } : { kind: "idle" },
  );

  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function signInWithGoogle() {
    setStatus({ kind: "sending" });
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) setStatus({ kind: "error", message: error.message });
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!email) return;
    setStatus({ kind: "sending" });
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    setStatus(error ? { kind: "error", message: error.message } : { kind: "sent", email });
  }

  if (!isSupabaseConfigured) {
    return (
      <p className="rounded-card border border-line bg-surface p-4 text-body-sm text-muted">
        Sign-in needs Supabase. Add <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to <code className="font-mono">.env.local</code>.
      </p>
    );
  }

  if (status.kind === "sent") {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5" role="status">
        <span className="material-symbol text-[1.75rem] text-accent-text" aria-hidden>
          mail
        </span>
        <p className="font-display text-title font-bold tracking-[-0.02em]">Check your inbox.</p>
        <p className="text-body-sm text-muted">
          We sent a sign-in link to <span className="font-medium text-ink">{status.email}</span>. Tap it on this device.
        </p>
      </div>
    );
  }

  const busy = status.kind === "sending";

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" onClick={signInWithGoogle} disabled={busy}>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-caption text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
        <label htmlFor="email" className="text-body-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          className="min-h-11 rounded-chip border border-line bg-surface px-4 text-body text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Email me a link"}
        </Button>
      </form>

      {status.kind === "error" ? (
        <p className="text-body-sm text-danger" role="alert">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
