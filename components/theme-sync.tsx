"use client";

import { useEffect } from "react";
import { applyTheme, type Accent, type Theme } from "@/lib/theme";

/** Brings this device in line with the theme saved on the profile. */
export function ThemeSync({ theme, accent }: { theme: Theme; accent: Accent }) {
  useEffect(() => {
    const { dataset } = document.documentElement;
    if (dataset.theme !== theme || dataset.accent !== accent) applyTheme(theme, accent);
  }, [theme, accent]);
  return null;
}
