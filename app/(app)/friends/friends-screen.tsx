"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp, useTasks } from "@/components/app/app-context";
import { Avatar } from "@/components/friends/avatar";
import { InviteCard } from "@/components/friends/invite-card";
import { Sheet } from "@/components/ui/sheet";
import { addDays, todayISO } from "@/lib/dates";
import { friends, type FoundPerson, type Friend, type Person, type Request } from "@/lib/friends";

const sectionLabel = "px-1 pt-2 text-caption font-semibold tracking-[0.06em] text-muted uppercase";
const nameOf = (p: Person) => p.display_name ?? p.username ?? "Rivl user";
const REPORT_REASONS = ["Spam", "Harassment", "Inappropriate name", "Cheating", "Something else"];

/** A friend's streak is live if they ticked something today or yesterday. */
const liveStreak = (f: Friend) => (f.streak_last_on && f.streak_last_on >= addDays(todayISO(), -1) ? f.streak_count : 0);

export function FriendsScreen() {
  const router = useRouter();
  const { showToast } = useApp();
  const { online } = useTasks();
  const [list, setList] = useState<Friend[] | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundPerson[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Friend | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);

  const load = useCallback(async () => {
    const [l, r] = await Promise.all([friends.list(), friends.requests()]);
    setList(l);
    setRequests(r);
  }, []);

  useEffect(() => {
    // Fetch on arrival (and when the connection comes back).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (online) load().catch(() => setList([]));
  }, [online, load]);

  // Search as you type, with a short pause so we don't query on every key.
  const searchable = query.trim().replace(/^@/, "").length >= 2;
  useEffect(() => {
    const q = query.trim();
    if (q.replace(/^@/, "").length < 2) return;
    const t = setTimeout(() => {
      friends.search(q).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function act(key: string, run: () => Promise<string>, done?: (result: string) => void) {
    setBusy(key);
    try {
      const result = await run();
      if (result === "limit") showToast("That's enough for today. Try again tomorrow.", "schedule");
      else if (result === "unavailable") showToast("That didn't work. They may not be available.", "close");
      else done?.(result);
      await load();
      if (query.trim().length >= 2) setResults(await friends.search(query.trim()));
    } catch {
      showToast("Couldn't reach Rivl. Check your connection.", "cloud_off");
    } finally {
      setBusy(null);
    }
  }

  const incoming = requests.filter((r) => r.direction === "incoming");
  const outgoing = requests.filter((r) => r.direction === "outgoing");
  const blocked = requests.filter((r) => r.direction === "blocked");

  return (
    <div className="flex flex-col gap-3">
      <header className="-ml-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/me"))}
          aria-label="Back"
          className="grid size-11 place-items-center rounded-full hover:bg-surface-2"
        >
          <span className="material-symbol text-2xl" aria-hidden>
            chevron_left
          </span>
        </button>
        <h1 className="font-display text-heading font-bold tracking-[-0.02em]">Friends</h1>
      </header>

      {!online ? (
        <p className="flex items-center gap-2 rounded-card border border-line bg-surface p-4 text-body-sm text-muted">
          <span className="material-symbol icon-outline text-xl" aria-hidden>
            cloud_off
          </span>
          Friends need a connection. Your tasks still work offline.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4" aria-labelledby="invite">
            <div>
              <h2 id="invite" className="font-display text-title font-bold">
                Bring a rival
              </h2>
              <p className="mt-1 text-body-sm text-muted">New to Rivl? You both get +100 points when they join with your link.</p>
            </div>
            <InviteCard />
          </section>

          <label className="mt-2 flex h-12 items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:border-accent">
            <span className="material-symbol icon-outline text-xl text-muted" aria-hidden>
              search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find by username"
              aria-label="Find by username"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="search"
              className="h-full flex-1 bg-transparent text-body outline-none placeholder:text-muted"
            />
          </label>

          {searchable && results ? (
            <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface" aria-label="Search results">
              {results.length === 0 ? <li className="p-4 text-body-sm text-muted">No one with that username yet.</li> : null}
              {results.map((p, i) => (
                <li key={p.id} className={`flex items-center gap-3 px-3 py-2 ${i ? "border-t border-line" : ""}`}>
                  <Avatar name={nameOf(p)} accent={p.accent} />
                  <PersonName person={p} />
                  {p.relation === "friends" ? (
                    <span className="text-caption font-semibold text-muted">Friends</span>
                  ) : p.relation === "outgoing" ? (
                    <span className="text-caption font-semibold text-muted">Requested</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() =>
                        act(p.id, () => friends.request(p.id), (r) =>
                          showToast(r === "friends" ? `You and ${nameOf(p)} are now rivals.` : `Request sent to ${nameOf(p)}.`, "person_add"),
                        )
                      }
                      className="flex h-10 items-center gap-1 rounded-full bg-accent px-3.5 text-body-sm font-semibold text-on-accent disabled:opacity-50"
                    >
                      <span className="material-symbol text-lg" aria-hidden>
                        person_add
                      </span>
                      {p.relation === "incoming" ? "Accept" : "Add"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {incoming.length ? (
            <>
              <h2 className={sectionLabel}>Requests · {incoming.length}</h2>
              <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
                {incoming.map((r, i) => (
                  <li key={r.friendship_id} className={`flex items-center gap-3 px-3 py-2 ${i ? "border-t border-line" : ""}`}>
                    <Avatar name={nameOf(r)} accent={r.accent} />
                    <PersonName person={r} />
                    <button
                      type="button"
                      aria-label={`Decline ${nameOf(r)}`}
                      disabled={busy === r.friendship_id}
                      onClick={() => act(r.friendship_id, () => friends.respond(r.friendship_id, false))}
                      className="grid size-10 place-items-center rounded-full border border-line text-muted"
                    >
                      <span className="material-symbol text-xl" aria-hidden>
                        close
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy === r.friendship_id}
                      onClick={() => act(r.friendship_id, () => friends.respond(r.friendship_id, true), () => showToast(`You and ${nameOf(r)} are now rivals.`, "swords"))}
                      className="h-10 rounded-full bg-accent px-4 text-body-sm font-semibold text-on-accent"
                    >
                      Accept
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <h2 className={sectionLabel}>Your rivals{list ? ` · ${list.length}` : ""}</h2>
          {list === null ? (
            <div className="h-32 animate-pulse rounded-card bg-surface" aria-busy="true" />
          ) : list.length === 0 ? (
            <p className="rounded-card border border-dashed border-line p-5 text-center text-body-sm text-muted">
              No rivals yet. Send your link to the friend who always says they&apos;re &ldquo;so productive&rdquo;.
            </p>
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
              {list.map((f, i) => (
                <li key={f.id} className={i ? "border-t border-line" : ""}>
                  <button type="button" onClick={() => setOpen(f)} className="flex w-full items-center gap-3 px-3 py-2 text-left">
                    <Avatar name={nameOf(f)} accent={f.accent} />
                    <PersonName person={f} />
                    {liveStreak(f) > 0 ? (
                      <span className="flex items-center gap-0.5 font-display text-body-sm font-bold tabular-nums" aria-label={`${liveStreak(f)}-day streak`}>
                        <span className="material-symbol bg-linear-0 from-[#FF7A1A] to-[#FFC93D] bg-clip-text text-lg text-transparent" aria-hidden>
                          local_fire_department
                        </span>
                        {liveStreak(f)}
                      </span>
                    ) : null}
                    <span className="material-symbol text-xl text-muted" aria-hidden>
                      more_horiz
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {outgoing.length ? (
            <>
              <h2 className={sectionLabel}>Waiting on · {outgoing.length}</h2>
              <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
                {outgoing.map((r, i) => (
                  <li key={r.friendship_id} className={`flex items-center gap-3 px-3 py-2 ${i ? "border-t border-line" : ""}`}>
                    <Avatar name={nameOf(r)} accent={r.accent} />
                    <PersonName person={r} />
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => act(r.id, () => friends.remove(r.id))}
                      className="h-10 rounded-full border border-line px-3.5 text-body-sm font-semibold text-muted"
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {blocked.length ? (
            <>
              <button
                type="button"
                aria-expanded={showBlocked}
                onClick={() => setShowBlocked((v) => !v)}
                className={`${sectionLabel} flex min-h-11 items-center justify-between pt-0`}
              >
                Blocked · {blocked.length}
                <span className="material-symbol text-xl" aria-hidden>
                  {showBlocked ? "expand_less" : "expand_more"}
                </span>
              </button>
              {showBlocked ? (
                <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
                  {blocked.map((r, i) => (
                    <li key={r.friendship_id} className={`flex items-center gap-3 px-3 py-2 ${i ? "border-t border-line" : ""}`}>
                      <Avatar name={nameOf(r)} accent={r.accent} />
                      <PersonName person={r} />
                      <button
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => act(r.id, () => friends.remove(r.id), () => showToast(`Unblocked ${nameOf(r)}.`, "check"))}
                        className="h-10 rounded-full border border-line px-3.5 text-body-sm font-semibold"
                      >
                        Unblock
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </>
      )}

      {open ? (
        <PersonSheet
          friend={open}
          onClose={() => setOpen(null)}
          onRemove={() => act(open.id, () => friends.remove(open.id), () => showToast(`Removed ${nameOf(open)}.`, "person_remove")).then(() => setOpen(null))}
          onBlock={() => act(open.id, () => friends.block(open.id), () => showToast(`Blocked ${nameOf(open)}. They can't find or add you.`, "block")).then(() => setOpen(null))}
          onReport={(reason) => act(open.id, () => friends.report(open.id, reason), () => showToast("Thanks. We'll take a look.", "flag")).then(() => setOpen(null))}
        />
      ) : null}
    </div>
  );
}

function PersonName({ person }: { person: Person }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[0.9375rem] font-semibold">{nameOf(person)}</span>
      {person.username ? <span className="block truncate text-caption text-muted">@{person.username}</span> : null}
    </span>
  );
}

function PersonSheet({
  friend,
  onClose,
  onRemove,
  onBlock,
  onReport,
}: {
  friend: Friend;
  onClose: () => void;
  onRemove: () => void;
  onBlock: () => void;
  onReport: (reason: string) => void;
}) {
  const [mode, setMode] = useState<"menu" | "report" | "confirm-block">("menu");
  const item = "flex h-13 w-full items-center gap-3 px-4 text-left text-[0.9375rem] font-medium";

  return (
    <Sheet
      title={
        <span className="flex items-center gap-3">
          <Avatar name={nameOf(friend)} accent={friend.accent} size={44} />
          <span>
            {nameOf(friend)}
            {friend.username ? <span className="block font-sans text-body-sm font-normal text-muted">@{friend.username}</span> : null}
          </span>
        </span>
      }
      onClose={onClose}
    >
      {mode === "menu" ? (
        <div className="flex flex-col overflow-hidden rounded-card border border-line bg-bg">
          <button type="button" data-autofocus className={item} onClick={onRemove}>
            <span className="material-symbol icon-outline text-[1.375rem] text-muted" aria-hidden>
              person_remove
            </span>
            Remove friend
          </button>
          <button type="button" className={`${item} border-t border-line`} onClick={() => setMode("report")}>
            <span className="material-symbol icon-outline text-[1.375rem] text-muted" aria-hidden>
              flag
            </span>
            Report
          </button>
          <button type="button" className={`${item} border-t border-line text-danger`} onClick={() => setMode("confirm-block")}>
            <span className="material-symbol icon-outline text-[1.375rem]" aria-hidden>
              block
            </span>
            Block
          </button>
        </div>
      ) : mode === "confirm-block" ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-muted">
            {nameOf(friend)} won&apos;t be able to find you, add you, or see your wins. They won&apos;t be told.
          </p>
          <button type="button" data-autofocus onClick={onBlock} className="h-12 rounded-full bg-danger font-semibold text-[#0B0B10]">
            Block {nameOf(friend)}
          </button>
          <button type="button" onClick={() => setMode("menu")} className="h-11 rounded-full font-medium text-muted">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-body-sm text-muted">What&apos;s wrong? Reports are private.</p>
          {REPORT_REASONS.map((r, i) => (
            <button
              key={r}
              type="button"
              data-autofocus={i === 0 ? true : undefined}
              onClick={() => onReport(r)}
              className="flex min-h-12 items-center rounded-chip border border-line bg-bg px-4 text-left text-[0.9375rem] font-medium"
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
