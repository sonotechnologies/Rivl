import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppChrome } from "@/components/app/app-chrome";
import { AppProvider } from "@/components/app/app-context";
import { NavBar } from "@/components/app/bottom-nav";
import { ServiceWorker } from "@/components/app/service-worker";
import { ThemeSync } from "@/components/theme-sync";
import { getCurrentProfile } from "@/lib/auth";
import { TodaySkeleton } from "./today/today-screen";

// Signed-in tabs. The shell prerenders; the profile streams in behind Suspense.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 pt-3 pb-[calc(96px+env(safe-area-inset-bottom))]">
      <ServiceWorker />
      <Suspense
        fallback={
          <>
            <TodaySkeleton />
            <NavBar />
          </>
        }
      >
        <SignedIn>{children}</SignedIn>
      </Suspense>
    </div>
  );
}

async function SignedIn({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  // New accounts personalise Rivl first.
  if (!profile.onboarded_at) redirect("/onboarding");
  return (
    <AppProvider profile={profile}>
      <ThemeSync theme={profile.theme} accent={profile.accent} />
      <main>{children}</main>
      <AppChrome />
    </AppProvider>
  );
}
