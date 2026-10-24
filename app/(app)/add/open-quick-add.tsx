"use client";

import { useEffect } from "react";
import { useApp } from "@/components/app/app-context";

export function OpenQuickAdd() {
  const { openQuickAdd } = useApp();
  useEffect(() => {
    openQuickAdd();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
