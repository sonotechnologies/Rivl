"use client";

import { createClient } from "@/lib/supabase/client";

// Browser side of web push: subscribing this device and nudging the server to send.

export const PUSH_KINDS = [
  { id: "nudge", label: "Nudges", hint: "When a friend nudges you" },
  { id: "challenge", label: "Challenges", hint: "Invites, accepts and results" },
  { id: "friend", label: "Friend requests", hint: "New requests and accepts" },
  { id: "streak", label: "Streak at risk", hint: "8 pm, if you haven't ticked anything off" },
  { id: "weekly", label: "Weekly result", hint: "Monday morning: how you finished" },
] as const;
export type PushKind = (typeof PUSH_KINDS)[number]["id"];
export type PushPrefs = Partial<Record<PushKind, boolean>>;

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export type PushState = "unsupported" | "install" | "denied" | "off" | "on";

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

/** Where this device stands. On iPhone, push only works once Rivl is on the Home Screen. */
export async function pushState(): Promise<PushState> {
  if (!KEY || !("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window) || !("Notification" in window)) return isIOS() && !standalone() ? "install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = await (await registration())?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64: string) {
  const raw = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function save(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await createClient().rpc("save_push_subscription", { p_endpoint: sub.endpoint, p_p256dh: json.keys?.p256dh, p_auth: json.keys?.auth });
  if (error) throw error;
}

/** Asks permission (must follow a tap), subscribes and saves this device. */
export async function enablePush(): Promise<PushState> {
  if (!KEY) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = (await registration()) ?? (await navigator.serviceWorker.ready);
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
  await save(sub);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await createClient().rpc("remove_push_subscription", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  return "off";
}

/** On app open: re-saves this device for whoever is signed in (covers account switches). */
export async function resyncPush() {
  if (!KEY || !("Notification" in window) || Notification.permission !== "granted") return;
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) await save(sub).catch(() => {});
}

/** Asks the server to send anything due, e.g. right after nudging someone. Never throws. */
export function sendDuePushes() {
  if (typeof window === "undefined" || !navigator.onLine) return;
  void fetch("/api/push/flush", { method: "POST", keepalive: true }).catch(() => {});
}
