import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentProfile } from "@/lib/auth";
import { OnboardingFlow } from "./onboarding-flow";

export const metadata: Metadata = { title: "Welcome" };

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 pt-2 pb-[max(28px,env(safe-area-inset-bottom))]">
      <Suspense fallback={<div className="mt-24 h-64 animate-pulse rounded-card bg-surface" aria-busy="true" />}>
        <Onboarding />
      </Suspense>
    </main>
  );
}

async function Onboarding() {
  const profile = await getCurrentProfile();
  return <OnboardingFlow profile={profile} />;
}
