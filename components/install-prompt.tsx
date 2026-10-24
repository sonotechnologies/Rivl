"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode = "hidden" | "prompt" | "ios";

/**
 * "Install app" for browsers that fire beforeinstallprompt (Android, desktop
 * Chromium), and Add to Home Screen instructions for iPhone Safari.
 */
export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform is only known in the browser
    if (isIos) setMode("ios");

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("prompt");
    };
    const onInstalled = () => setMode("hidden");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === "prompt" && deferred) {
    return (
      <Button
        variant="outline"
        onClick={async () => {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
          setMode("hidden");
        }}
      >
        <span className="material-symbol text-xl" aria-hidden>
          download
        </span>
        Install app
      </Button>
    );
  }

  if (mode === "ios") {
    return (
      <p className="flex items-center gap-2 text-body-sm text-muted">
        <span className="material-symbol text-xl text-accent-text" aria-hidden>
          ios_share
        </span>
        Install: tap Share, then Add to Home Screen.
      </p>
    );
  }

  return null;
}
