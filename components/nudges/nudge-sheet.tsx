"use client";

import { useEffect, useState } from "react";
import { useApp, useBoard, useTasks } from "@/components/app/app-context";
import { Avatar } from "@/components/friends/avatar";
import { Sheet } from "@/components/ui/sheet";
import { ai, isAIError } from "@/lib/ai/client";
import { nameOf } from "@/lib/board";
import { NUDGE_PRESETS, NUDGES_PER_DAY, nudges } from "@/lib/nudges";

/** The nudge picker from the design: a preset line, or one the AI writes in your coach's voice. */
export function NudgeSheet({ friendId }: { friendId: string }) {
  const { closeSheet, showToast } = useApp();
  const { online } = useTasks();
  const { rows } = useBoard();
  const friend = rows?.find((r) => r.id === friendId);
  const name = friend ? nameOf(friend) : "your friend";
  const [written, setWritten] = useState<string | null>(null);
  const [pick, setPick] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void nudges.left(friendId).then(setLeft);
  }, [friendId]);

  const options = written ? [written, ...NUDGE_PRESETS] : NUDGE_PRESETS;
  const none = left === 0;

  async function write() {
    setWriting(true);
    const r = await ai.nudge(friendId);
    setWriting(false);
    if (isAIError(r)) return showToast(r.message, "auto_awesome");
    setWritten(r.message);
    setPick(0);
  }

  async function send() {
    setSending(true);
    const message = options[pick];
    try {
      await nudges.send(friendId, message);
      navigator.vibrate?.(8);
      closeSheet();
      showToast(`Nudge sent to ${name}: "${message}"`, undefined, friend ? { name: friend.display_name ?? name, accent: friend.accent } : undefined);
    } catch (e) {
      setSending(false);
      if (e instanceof Error && e.message === "limit") {
        setLeft(0);
        showToast(`That's ${NUDGES_PER_DAY} nudges for ${name} today.`, "schedule");
      } else showToast(online ? "Couldn't send that nudge. Try again." : "Nudges need a connection.", "cloud_off");
    }
  }

  return (
    <Sheet
      title={
        <span className="flex items-center gap-3">
          <Avatar name={friend?.display_name ?? name} accent={friend?.accent} size={48} />
          <span>
            <span className="block">Nudge {name}</span>
            {friend ? (
              <span className="mt-0.5 block font-sans text-[0.8125rem] font-normal text-muted">
                #{friend.rank} · {friend.points.toLocaleString("en-GB")} pts
              </span>
            ) : null}
          </span>
        </span>
      }
      onClose={closeSheet}
    >
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Message">
        {options.map((m, i) => {
          const on = i === pick;
          return (
            <button
              key={`${i}-${m}`}
              type="button"
              role="radio"
              aria-checked={on}
              data-autofocus={on || undefined}
              onClick={() => setPick(i)}
              className={`flex min-h-12 items-center gap-3 rounded-chip px-3.5 py-2 text-left text-[0.9375rem] font-medium ${on ? "border-[1.5px] border-accent bg-[color-mix(in_oklab,var(--accent)_10%,var(--bg))]" : "border border-line bg-bg"}`}
            >
              <span className={`size-[18px] flex-none rounded-full ${on ? "border-[6px] border-accent" : "border-2 border-muted"}`} aria-hidden />
              <span className="flex-1">{m}</span>
              {written && i === 0 ? (
                <span className="material-symbol text-lg text-accent-text" aria-label="Written by your coach">
                  auto_awesome
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={write}
        disabled={!online || writing || none}
        className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-dashed border-line text-body-sm font-semibold disabled:opacity-50"
      >
        <span className="material-symbol text-lg text-accent-text" aria-hidden>
          auto_awesome
        </span>
        {writing ? "Writing…" : written ? "Write another · 1 AI action" : "Write one in my coach's voice · 1 AI action"}
      </button>
      <button
        type="button"
        onClick={send}
        disabled={sending || none || !online}
        className="flex h-13 items-center justify-center gap-2 rounded-full bg-accent text-body font-semibold text-on-accent disabled:opacity-50"
      >
        <span className="material-symbol text-xl" aria-hidden>
          send
        </span>
        {none ? `No nudges left for ${name} today` : sending ? "Sending…" : "Send nudge"}
      </button>
      {left !== null && !none ? (
        <p className="-mt-1 text-center text-caption text-muted">
          {left} of {NUDGES_PER_DAY} left for {name} today
        </p>
      ) : null}
    </Sheet>
  );
}
