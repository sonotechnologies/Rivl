"use client";

import { useEffect } from "react";
import { resyncPush, sendDuePushes } from "@/lib/push/client";

const KEY = "rivl-push-flushed";

/** On app open: keep this device's subscription on the signed-in account, and send anything due (at most every 2 minutes). */
export function PushSync() {
  useEffect(() => {
    void resyncPush();
    try {
      if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 120_000) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {}
    sendDuePushes();
  }, []);
  return null;
}
