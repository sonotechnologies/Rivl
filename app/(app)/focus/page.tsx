import type { Metadata } from "next";
import { Suspense } from "react";
import { FocusScreen } from "./focus-screen";

export const metadata: Metadata = { title: "Focus" };

export default function FocusPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-24 size-[280px] animate-pulse rounded-full bg-surface" />}>
      <FocusScreen />
    </Suspense>
  );
}
