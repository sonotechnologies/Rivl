"use client";

import { useEffect } from "react";

/** Registers /sw.js in production builds, for offline use and installability. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  }, []);
  return null;
}

/** Wipes this device's offline copies on sign-out, so the next person can't see them. */
export async function clearOfflineData() {
  const controller = navigator.serviceWorker?.controller;
  controller?.postMessage({ type: "CLEAR_CACHES" });
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("rivl-")).map((k) => caches.delete(k)));
  }
  if ("indexedDB" in window) indexedDB.deleteDatabase("rivl");
}
