import type { Metadata } from "next";
import { Suspense } from "react";
import { RecapScreen } from "./recap-screen";

export const metadata: Metadata = { title: "Weekly recap" };

export default function RecapPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-16 aspect-[9/16] w-full max-w-[340px] animate-pulse rounded-card bg-surface" />}>
      <RecapScreen />
    </Suspense>
  );
}
