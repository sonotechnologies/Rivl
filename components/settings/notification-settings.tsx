"use client";

import { useEffect, useState, useTransition } from "react";
import { disablePush, enablePush, pushState, PUSH_KINDS, type PushState } from "@/lib/push/client";
import { savePreferences } from "@/app/settings/actions";

const sectionTitle = "font-display text-title font-bold tracking-[-0.02em]";

function Switch({ on, label, onToggle, disabled }: { on: boolean; label: string; onToggle: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onToggle} className="grid h-11 w-14 flex-none place-items-center disabled:opacity-50">
      <span className={`relative h-7 w-12 rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-2 ring-1 ring-line"}`}>
        <span className={`absolute top-0.5 size-6 rounded-full transition-[left] duration-150 ${on ? "left-[22px] bg-on-accent" : "left-0.5 bg-muted"}`} />
      </span>
    </button>
  );
}

const DEVICE_NOTE: Partial<Record<PushState, string>> = {
  unsupported: "This browser can't show notifications from Rivl.",
  install: "On iPhone, notifications need Rivl on your Home Screen: tap Share, then Add to Home Screen, then open Rivl from there and turn this on.",
  denied: "Notifications are blocked for Rivl. Allow them in your browser or phone settings, then come back here.",
};

/** Push on this device, plus which kinds you want (saved to your account, so every device follows). */
export function NotificationSettings({ prefs: initial }: { prefs: Record<string, boolean> }) {
  const [device, setDevice] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    void pushState().then(setDevice);
  }, []);

  async function toggleDevice() {
    setBusy(true);
    setError(null);
    try {
      setDevice(device === "on" ? await disablePush() : await enablePush());
    } catch {
      setError("Couldn't change notifications on this device. Try again.");
      setDevice(await pushState());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="notifications">
      <h2 id="notifications" className={sectionTitle}>
        Notifications
      </h2>
      <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
        <div className="flex items-start justify-between gap-4 p-4">
          <div>
            <p className="text-body font-semibold">Push on this device</p>
            <p className="mt-1 text-body-sm text-muted">
              {device && DEVICE_NOTE[device] ? DEVICE_NOTE[device] : "Up to 5 a day, and never during your sleep hours."}
            </p>
          </div>
          {device === "on" || device === "off" ? (
            <Switch on={device === "on"} label="Push on this device" onToggle={toggleDevice} disabled={busy} />
          ) : null}
        </div>
        {PUSH_KINDS.map((k) => {
          const on = prefs[k.id] !== false;
          return (
            <div key={k.id} className="flex items-center justify-between gap-4 py-1 pr-4 pl-4">
              <div>
                <p className="text-body-sm font-semibold">{k.label}</p>
                <p className="text-caption text-muted">{k.hint}</p>
              </div>
              <Switch
                on={on}
                label={k.label}
                onToggle={() => {
                  const next = { ...prefs, [k.id]: !on };
                  setPrefs(next);
                  startTransition(async () => {
                    const { error } = await savePreferences({ push_prefs: next });
                    setError(error);
                  });
                }}
              />
            </div>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
