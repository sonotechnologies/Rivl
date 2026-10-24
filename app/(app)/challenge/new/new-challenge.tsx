"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp, useChallenges } from "@/components/app/app-context";
import { Avatar } from "@/components/friends/avatar";
import { challenges, WIN_POINTS, type ChallengeType } from "@/lib/challenges";
import { friends, type Friend } from "@/lib/friends";

const TARGETS = [5, 10, 20, 30];

const endOfDay = (d: Date) => {
  const e = new Date(d);
  e.setHours(23, 59, 0, 0);
  return e;
};
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return endOfDay(d);
};
/** End options. "Tonight" only while there's over an hour left (the server's minimum). */
function endOptions(now = new Date()) {
  const options = [];
  if (endOfDay(now).getTime() - now.getTime() > 60 * 60_000) options.push({ id: "tonight", label: "Tonight", at: endOfDay(now) });
  options.push({ id: "tomorrow", label: "Tomorrow", at: plusDays(1) });
  const toSunday = (7 - now.getDay()) % 7 || 7;
  // On Saturdays, tomorrow already is Sunday.
  if (toSunday > 1) options.push({ id: "sunday", label: "Sunday", at: plusDays(toSunday) });
  options.push({ id: "week", label: "In a week", at: plusDays(7) });
  return options;
}

const ERRORS: Record<string, string> = {
  not_friends: "You can only challenge friends.",
  too_many: "You've got 5 challenges going. Finish one first.",
  bad_end: "Pick an end time between an hour and two weeks away.",
  bad_target: "Pick how many tasks.",
};

const choice = (on: boolean) =>
  on ? "border-[1.5px] border-accent bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface))]" : "border border-line bg-surface";
const label = "text-caption font-semibold tracking-[0.06em] text-muted uppercase";

export function NewChallenge() {
  const router = useRouter();
  const params = useSearchParams();
  const { showToast } = useApp();
  const { refresh } = useChallenges();
  const [list, setList] = useState<Friend[] | null>(null);
  const [who, setWho] = useState<string | null>(params.get("friend"));
  const [type, setType] = useState<ChallengeType>("tasks");
  const [target, setTarget] = useState(10);
  // Times depend on the device clock and time zone, so they're worked out after mount.
  const [ends, setEnds] = useState<ReturnType<typeof endOptions> | null>(null);
  const [end, setEnd] = useState("sunday");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const options = endOptions();
    setEnds(options);
    if (!options.some((o) => o.id === "sunday")) setEnd("tomorrow");
    friends
      .list()
      .then(setList)
      .catch(() => setList([]));
  }, []);

  const rival = list?.find((f) => f.id === who);
  const endAt = ends?.find((e) => e.id === end)?.at ?? null;
  const endText = endAt ? new Intl.DateTimeFormat("en-GB", { weekday: "long", hour: "numeric", minute: "2-digit" }).format(endAt) : "";

  async function send() {
    if (!who || !endAt) return;
    setSending(true);
    setError(null);
    try {
      await challenges.create(who, type, type === "tasks" ? target : null, endAt);
      await refresh();
      showToast(`Challenge sent to ${rival?.display_name?.split(" ")[0] ?? "your rival"}.`, "swords");
      router.push("/board");
    } catch (e) {
      const code = e instanceof Error ? Object.keys(ERRORS).find((k) => e.message.includes(k)) : undefined;
      setError(code ? ERRORS[code] : "Couldn't send it. Check your connection and try again.");
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="-ml-2 flex items-center gap-1">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="grid size-11 place-items-center rounded-full hover:bg-surface-2">
          <span className="material-symbol text-2xl" aria-hidden>
            chevron_left
          </span>
        </button>
        <h1 className="font-display text-heading font-bold tracking-[-0.02em]">New challenge</h1>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className={label}>Who</h2>
        {list === null ? (
          <div className="h-[72px] animate-pulse rounded-card bg-surface" aria-busy="true" />
        ) : list.length === 0 ? (
          <p className="rounded-card border border-dashed border-line p-4 text-body-sm text-muted">
            Challenges are between friends.{" "}
            <Link href="/friends" className="font-semibold text-accent-text">
              Add a rival first
            </Link>
            .
          </p>
        ) : (
          <div role="radiogroup" aria-label="Friend" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {list.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={who === f.id}
                onClick={() => setWho(f.id)}
                className={`flex w-[84px] flex-none flex-col items-center gap-1.5 rounded-card px-1 py-3 ${choice(who === f.id)}`}
              >
                <Avatar name={f.display_name ?? f.username ?? "?"} accent={f.accent} size={44} />
                <span className="w-full truncate text-center text-caption font-semibold">{f.display_name?.split(" ")[0] ?? f.username}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={label}>What</h2>
        <div role="radiogroup" aria-label="Challenge type" className="flex flex-col gap-2">
          {(
            [
              ["tasks", "First to N tasks", "First to finish that many tasks wins. Only tasks that earn points count."],
              ["points", "Most points", "Whoever scores more by the end wins."],
            ] as const
          ).map(([id, name, desc]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={type === id}
              onClick={() => setType(id)}
              className={`flex flex-col gap-0.5 rounded-card px-4 py-3 text-left ${choice(type === id)}`}
            >
              <span className="text-body font-semibold">{id === "tasks" ? `First to ${target} tasks` : name}</span>
              <span className="text-body-sm text-muted">{desc}</span>
            </button>
          ))}
        </div>
        {type === "tasks" ? (
          <div role="radiogroup" aria-label="How many tasks" className="grid grid-cols-4 gap-2">
            {TARGETS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={target === n}
                onClick={() => setTarget(n)}
                className={`h-11 rounded-chip font-display text-body font-bold ${target === n ? "border-[1.5px] border-accent bg-accent text-on-accent" : "border border-line bg-surface"}`}
              >
                {n}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={label}>Ends</h2>
        <div role="radiogroup" aria-label="Ends" className="grid grid-cols-2 gap-2">
          {(ends ?? []).map((e) => (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={end === e.id}
              onClick={() => setEnd(e.id)}
              className={`min-h-11 rounded-chip text-body-sm font-semibold ${choice(end === e.id)}`}
            >
              {e.label}
            </button>
          ))}
        </div>
        {endText ? <p className="text-caption text-muted">Ends {endText}. It starts when they accept.</p> : null}
      </section>

      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={send}
        disabled={!who || sending}
        className="flex h-13 items-center justify-center gap-2 rounded-full bg-accent text-body font-semibold text-on-accent disabled:opacity-50"
      >
        <span className="material-symbol text-xl" aria-hidden>
          swords
        </span>
        {sending ? "Sending…" : rival ? `Challenge ${rival.display_name?.split(" ")[0] ?? rival.username}` : "Pick a rival"}
      </button>
      <p className="-mt-3 text-center text-caption text-muted">Winner gets +{WIN_POINTS} points and the Rival badge.</p>
    </div>
  );
}
