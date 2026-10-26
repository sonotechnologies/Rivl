"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp, useTasks } from "@/components/app/app-context";
import { ChoiceButton } from "@/components/tasks/task-bits";
import { addDays, weekStartISO } from "@/lib/dates";
import { friends, inviteUrl } from "@/lib/friends";
import { weekNumber, type Recap } from "@/lib/recap";
import { createClient } from "@/lib/supabase/client";

/** Preview, share and download the weekly recap card (drawn by /api/recap/card). */
export function RecapScreen() {
  const { showToast } = useApp();
  const { online } = useTasks();
  const router = useRouter();
  const params = useSearchParams();
  const [recap, setRecap] = useState<Recap | null>(null);
  const [week, setWeek] = useState<string | null>(params.get("week"));
  const [showTask, setShowTask] = useState(false);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (!online) return;
    let live = true;
    void createClient()
      .rpc("my_recap", week ? { p_week: week } : {})
      .then(({ data }) => {
        const r = (data as Recap[] | null)?.[0] ?? null;
        if (!live || !r) return;
        setRecap(r);
        // Private tasks stay off the card unless you choose to show them.
        setShowTask(Boolean(r.top_shared));
      });
    return () => {
      live = false;
    };
  }, [week, online]);

  useEffect(() => {
    void friends.inviteCode().then(setCode).catch(() => {});
  }, []);

  const thisWeek = weekStartISO();
  const src = recap ? `/api/recap/card?week=${recap.week_start}${showTask ? "" : "&task=0"}` : null;
  const fileName = recap ? `rivl-week-${weekNumber(recap.week_start)}.png` : "rivl-week.png";
  const shareText = `My week on Rivl. Think you can beat me?${code ? ` ${inviteUrl(code)}` : ""}`;

  async function share() {
    if (!src) return;
    setBusy(true);
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText });
      } else {
        download(blob);
        showToast("Saved. Post it to your Status or Story.", "download");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") showToast("Couldn't share the card. Try Download instead.", "close");
    } finally {
      setBusy(false);
    }
  }

  function download(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="-ml-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/me"))}
          aria-label="Back"
          className="grid size-11 place-items-center rounded-full"
        >
          <span className="material-symbol text-2xl" aria-hidden>
            arrow_back
          </span>
        </button>
        <h1 className="font-display text-title font-bold">Weekly recap</h1>
      </header>

      <div className="flex gap-2" role="group" aria-label="Which week">
        <ChoiceButton on={recap?.week_start !== thisWeek} onClick={() => setWeek(addDays(thisWeek, -7))} className="flex-1">
          Last week
        </ChoiceButton>
        <ChoiceButton on={recap?.week_start === thisWeek} onClick={() => setWeek(thisWeek)} className="flex-1">
          This week so far
        </ChoiceButton>
      </div>

      {!online ? (
        <p className="rounded-card border border-line bg-surface p-4 text-body-sm text-muted">The recap card needs a connection.</p>
      ) : (
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-card border border-line bg-surface">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated PNG, private per user
            <img
              key={src}
              src={src}
              alt={recap ? `Week ${weekNumber(recap.week_start)} recap: #${recap.rank ?? 1}, ${recap.points ?? 0} points, ${recap.streak ?? 0}-day streak` : ""}
              onLoad={() => setLoadedSrc(src)}
              className={`size-full object-cover transition-opacity ${loadedSrc === src ? "opacity-100" : "opacity-0"}`}
            />
          ) : null}
          {loadedSrc !== src ? <div className="absolute inset-0 animate-pulse bg-surface-2" aria-hidden /> : null}
        </div>
      )}

      {recap?.top_task ? (
        <button
          type="button"
          role="switch"
          aria-checked={showTask}
          onClick={() => setShowTask((v) => !v)}
          className="flex min-h-11 items-center gap-3 rounded-chip border border-line bg-surface px-3.5 text-left"
        >
          <span className="flex-1">
            <span className="block text-body-sm font-semibold">Show my top task</span>
            <span className="block text-caption text-muted">{recap.top_shared ? "It's a shared task" : "It's private: off unless you turn it on"}</span>
          </span>
          <span className={`relative h-6 w-10 flex-none rounded-full transition-colors ${showTask ? "bg-accent" : "bg-surface-2 ring-1 ring-line"}`}>
            <span className={`absolute top-0.5 size-5 rounded-full transition-[left] duration-150 ${showTask ? "left-[18px] bg-on-accent" : "left-0.5 bg-muted"}`} />
          </span>
        </button>
      ) : null}

      <button
        type="button"
        onClick={share}
        disabled={!src || busy || !online}
        className="flex h-13 items-center justify-center gap-2 rounded-full bg-accent text-body font-semibold text-on-accent disabled:opacity-50"
      >
        <span className="material-symbol text-xl" aria-hidden>
          ios_share
        </span>
        {busy ? "Getting it ready…" : "Share to Status or Story"}
      </button>
      <button
        type="button"
        onClick={async () => src && download(await (await fetch(src)).blob())}
        disabled={!src || !online}
        className="flex h-11 items-center justify-center gap-2 rounded-full border border-line text-body-sm font-semibold disabled:opacity-50"
      >
        <span className="material-symbol text-lg" aria-hidden>
          download
        </span>
        Download image
      </button>
      <p className="text-center text-caption text-muted">Sharing adds your invite link, so friends who join become your rivals.</p>
    </div>
  );
}
