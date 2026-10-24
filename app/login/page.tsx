import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center gap-8 px-4 py-12">
      <Link href="/" className="self-start" aria-label="Rivl home">
        <Logo size="2.5rem" />
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-heading font-bold tracking-[-0.02em]">Sign in</h1>
        <p className="text-body text-muted">No passwords. Pick Google or get a link by email.</p>
      </div>
      <Suspense fallback={<div className="h-56 animate-pulse rounded-card bg-surface" />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
