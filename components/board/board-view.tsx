"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBoard } from "@/components/app/app-context";
import { Avatar } from "@/components/friends/avatar";
import { gapText, nameOf, resetCountdown, type BoardRow, type Move } from "@/lib/board";

// Gold, silver, bronze rings and podium block heights for places 1–3 (from the design).
const RINGS = ["#FFC93D", "#C9CED6", "#CD7F4A"];
const BLOCK_HEIGHTS = [136, 100, 76];

/** The weekly board from the design: countdown, podium, then everyone else. */
export function BoardView({ compact = false, onMeVisible }: { compact?: boolean; onMeVisible?: (visible: boolean) => void }) {
  const { rows, moved, error } = useBoard();

  return (
    <div className="grid auto-rows-max grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex items-center justify-between pt-1">
        <h1 className={`font-display font-bold tracking-[-0.02em] ${compact ? "text-title" : "text-heading"}`}>This week</h1>
        <Countdown />
      </div>

      {rows === null ? (
        error ? (
          <p className="rounded-card border border-line bg-surface p-4 text-body-sm text-muted">The board needs a connection. Your tasks still work offline.</p>
        ) : (
          <BoardSkeleton />
        )
      ) : rows.length <= 1 ? (
        <EmptyBoard me={rows[0]} />
      ) : (
        <>
          <Podium rows={rows.slice(0, 3)} moved={moved} />
          {rows.length > 3 ? <RankedList rows={rows.slice(3)} moved={moved} onMeVisible={onMeVisible} /> : null}
          <p className="px-1 text-caption text-muted">Resets Monday at midnight. Finish the week #1 to earn Giant Slayer.</p>
        </>
      )}
    </div>
  );
}

function Countdown() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setText(resetCountdown());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex h-8 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[0.8125rem] font-semibold tabular-nums">
      <span className="material-symbol icon-outline text-base text-muted" aria-hidden>
        timer
      </span>
      {text ? `Resets in ${text}` : "Resets Monday"}
    </div>
  );
}

function MoveArrow({ move, size = "text-base" }: { move?: Move; size?: string }) {
  if (!move) return null;
  return (
    <span
      className={`material-symbol ${size} motion-safe:animate-flash ${move === "up" ? "text-success" : "text-danger"}`}
      aria-label={move === "up" ? "moved up" : "moved down"}
    >
      {move === "up" ? "arrow_upward" : "arrow_downward"}
    </span>
  );
}

function Podium({ rows, moved }: { rows: BoardRow[]; moved: Record<string, Move> }) {
  // Second, first, third, so #1 stands in the middle.
  const order = [1, 0, 2];
  return (
    <ol className="mt-5 grid grid-cols-3 items-end gap-2" aria-label="Top three">
      {order.map((i) => {
        const r = rows[i];
        const first = i === 0;
        if (!r) return <li key={i} aria-hidden />;
        return (
          <li key={r.id} className="flex flex-col items-center gap-2" style={{ order: order.indexOf(i) }}>
            <Avatar name={r.display_name ?? r.username ?? "?"} accent={r.accent} size={first ? 68 : 56} ring={RINGS[i]} glow={first} />
            <div className="text-center">
              <div className={`flex items-center justify-center gap-0.5 text-body-sm font-semibold ${r.is_me ? "text-accent-text" : ""}`}>
                {nameOf(r)}
                <MoveArrow move={moved[r.id]} />
              </div>
              <div className="font-display text-body-sm font-bold text-muted tabular-nums">{r.points.toLocaleString("en-GB")}</div>
            </div>
            <div
              className={`flex w-full justify-center rounded-t-card pt-2.5 font-display text-hero leading-none font-bold ${first ? "bg-accent text-on-accent" : "border border-b-0 border-line bg-surface-2"} ${r.is_me && !first ? "border-accent" : ""}`}
              style={{ height: BLOCK_HEIGHTS[i] }}
              aria-label={`Rank ${r.rank}, ${r.points} points`}
            >
              {r.rank}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Ranks 4 and below. Rows glide to their new place when the order changes. */
function RankedList({ rows, moved, onMeVisible }: { rows: BoardRow[]; moved: Record<string, Move>; onMeVisible?: (v: boolean) => void }) {
  const refs = useRef(new Map<string, HTMLLIElement>());
  const last = useRef(new Map<string, number>());

  // FLIP: measure where rows were, then animate from there to where they are now.
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    refs.current.forEach((el, id) => {
      const top = el.getBoundingClientRect().top;
      const before = last.current.get(id);
      if (!reduce && before !== undefined && before !== top) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }], { duration: 300, easing: "ease-out" });
      }
      last.current.set(id, top);
    });
  }, [rows]);

  // Tell the page whether your own row is on screen (for the pinned row).
  useEffect(() => {
    const me = rows.find((r) => r.is_me);
    const el = me && refs.current.get(me.id);
    if (!onMeVisible) return;
    if (!el) return onMeVisible(true);
    // Pin unless the whole row is clear of the nav.
    const io = new IntersectionObserver(([e]) => onMeVisible(e.intersectionRatio > 0.99), { rootMargin: "0px 0px -96px 0px", threshold: [0, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, [rows, onMeVisible]);

  return (
    <ol className="-mt-1 flex flex-col gap-2" aria-label="Everyone else">
      {rows.map((r) => (
        <li
          key={r.id}
          ref={(el) => {
            if (el) refs.current.set(r.id, el);
            else refs.current.delete(r.id);
          }}
          className={`flex min-h-[50px] items-center gap-3 rounded-card bg-surface px-3.5 ${r.is_me ? "border-[1.5px] border-accent" : "border border-line"}`}
        >
          <span className="w-5 font-display text-body font-bold text-muted tabular-nums">{r.rank}</span>
          <Avatar name={r.display_name ?? r.username ?? "?"} accent={r.accent} size={36} />
          <span className="flex-1 truncate text-[0.9375rem] font-medium">{nameOf(r)}</span>
          <MoveArrow move={moved[r.id]} size="text-lg" />
          <span className="font-display text-body font-bold tabular-nums">{r.points.toLocaleString("en-GB")}</span>
        </li>
      ))}
    </ol>
  );
}

/** Your row, pinned above the nav when it's scrolled out of view. */
export function PinnedMe() {
  const { rows } = useBoard();
  const me = rows?.find((r) => r.is_me);
  if (!rows || !me) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-10 mx-auto w-full max-w-[480px] px-4 lg:left-[calc(50%-440px)] lg:right-auto lg:mx-0">
      <div className="flex min-h-11 animate-fade-in items-center gap-3 rounded-card border-[1.5px] border-accent bg-surface-2 px-3.5 py-2 shadow-[0_-12px_24px_var(--bg)]">
        <span className="w-6 font-display text-body font-bold text-accent-text tabular-nums">#{me.rank}</span>
        <Avatar name={me.display_name ?? "You"} accent={me.accent} size={28} />
        <div className="flex-1">
          <div className="text-[0.9375rem] font-semibold">You</div>
          <div className="text-caption text-muted">{gapText(rows)}</div>
        </div>
        <span className="font-display text-lg font-bold tabular-nums">{me.points.toLocaleString("en-GB")}</span>
      </div>
    </div>
  );
}

function EmptyBoard({ me }: { me?: BoardRow }) {
  return (
    <div className="mt-2 flex flex-col items-center gap-3 rounded-card border border-dashed border-line px-4 py-8 text-center">
      <div className="flex items-end gap-2" aria-hidden>
        <span className="h-10 w-12 rounded-t-chip bg-surface-2" />
        <span className="grid h-16 w-12 place-items-start justify-center rounded-t-chip bg-accent pt-1 font-display text-title font-bold text-on-accent">1</span>
        <span className="h-7 w-12 rounded-t-chip bg-surface-2" />
      </div>
      <p className="font-display text-title font-bold">A board of one</p>
      <p className="max-w-[280px] text-body-sm text-pretty text-muted">
        You&apos;re #1 with {me?.points ?? 0} pts, but there&apos;s no one to beat. Add your rivals and the race starts.
      </p>
      <Link href="/friends" className="flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-[0.9375rem] font-semibold text-on-accent">
        <span className="material-symbol text-xl" aria-hidden>
          person_add
        </span>
        Add your rivals
      </Link>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the board" className="flex flex-col gap-2">
      <div className="mt-5 grid h-[250px] grid-cols-3 items-end gap-2">
        {[150, 200, 120].map((h, i) => (
          <div key={i} className="animate-pulse rounded-t-card bg-surface-2" style={{ height: h }} />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[50px] animate-pulse rounded-card border border-line bg-surface" />
      ))}
    </div>
  );
}
