"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { friends, inviteMessage, inviteUrl, whatsappLink } from "@/lib/friends";

const noop = () => () => {};

/** Your invite link with Copy, WhatsApp, Share and a QR code to scan in person. */
export function InviteCard({ compact = false }: { compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const canShare = useSyncExternalStore(
    noop,
    () => "share" in navigator,
    () => false,
  );

  useEffect(() => {
    friends
      .inviteCode()
      .then((code) => setUrl(inviteUrl(code)))
      .catch(() => setFailed(true));
  }, []);

  async function toggleQr() {
    if (!url) return;
    if (!qr) {
      // Loaded on demand so it never weighs down the first screen.
      const { toString } = await import("qrcode");
      setQr(await toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0B0B10", light: "#FFFFFF" } }));
    }
    setShowQr((v) => !v);
  }

  if (failed) return <p className="text-body-sm text-muted">Your invite link needs a connection. Try again when you&apos;re online.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-12 items-center justify-between gap-2 rounded-chip border border-line bg-bg pr-1.5 pl-4">
        <span className="truncate font-mono text-body-sm text-muted">{url ? url.replace(/^https?:\/\//, "") : "Getting your link…"}</span>
        <button
          type="button"
          disabled={!url}
          onClick={async () => {
            await navigator.clipboard?.writeText(url!).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="flex h-9 flex-none items-center gap-1 rounded-full bg-surface-2 px-3 text-[0.8125rem] font-semibold"
        >
          <span className="material-symbol text-base" aria-hidden>
            {copied ? "check" : "content_copy"}
          </span>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className={`grid gap-2 ${compact ? "grid-cols-1" : canShare ? "grid-cols-[1fr_auto_auto]" : "grid-cols-[1fr_auto]"}`}>
        <a
          href={url ? whatsappLink(inviteMessage(url)) : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!url}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#25D366] text-[0.9375rem] font-semibold text-[#0B0B10]"
        >
          <span className="material-symbol text-xl" aria-hidden>
            chat
          </span>
          Invite on WhatsApp
        </a>
        {!compact && canShare ? (
          <button
            type="button"
            disabled={!url}
            aria-label="Share invite"
            onClick={() => navigator.share({ title: "Join me on Rivl", text: inviteMessage(url!), url: url! }).catch(() => {})}
            className="grid size-12 place-items-center rounded-full border border-line"
          >
            <span className="material-symbol text-xl" aria-hidden>
              share
            </span>
          </button>
        ) : null}
        {!compact ? (
          <button
            type="button"
            disabled={!url}
            aria-label={showQr ? "Hide QR code" : "Show QR code"}
            aria-pressed={showQr}
            onClick={toggleQr}
            className={`grid size-12 place-items-center rounded-full border ${showQr ? "border-accent text-accent-text" : "border-line"}`}
          >
            <span className="material-symbol text-xl" aria-hidden>
              qr_code_2
            </span>
          </button>
        ) : null}
      </div>
      {showQr && qr ? (
        <div className="flex flex-col items-center gap-2 rounded-card bg-white p-4">
          <div className="size-52" role="img" aria-label="QR code for your invite link" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="text-caption font-medium text-[#5E5E72]">Point a phone camera here to join you</p>
        </div>
      ) : null}
    </div>
  );
}
