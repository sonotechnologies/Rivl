import { DIFFICULTIES, DIFFICULTY_LABELS, pointsFor } from "@/lib/tasks/points";
import type { Difficulty } from "@/lib/tasks/types";

/** Five dots, filled up to the difficulty. Shimmers while the AI is still rating. */
export function Pips({ difficulty }: { difficulty: Difficulty | null }) {
  const d = difficulty ?? 0;
  return (
    <span
      className={`flex gap-[3px] ${d ? "" : "motion-safe:animate-pulse"}`}
      role="img"
      aria-label={d ? `Difficulty ${d} of 5, ${DIFFICULTY_LABELS[difficulty!]}` : "Rating difficulty"}
    >
      {DIFFICULTIES.map((n) => (
        <span key={n} className={`size-1.5 rounded-full ${n <= d ? "bg-accent-text" : d ? "bg-line" : "bg-muted/40"}`} />
      ))}
    </span>
  );
}

/** Accent pill with a tabular point value; "…" while the task is still being rated. */
export function PointsPill({ points, muted = false, prefix = "" }: { points: number | null; muted?: boolean; prefix?: string }) {
  return (
    <span
      aria-label={points === null ? "Points pending" : undefined}
      className={`min-w-9 rounded-full px-2.5 py-1 text-center font-display text-[0.8125rem] leading-none font-bold tabular-nums ${muted || points === null ? "bg-surface-2 text-muted" : "bg-accent text-on-accent"}`}
    >
      {points === null ? "…" : `${prefix}${points}`}
    </span>
  );
}

/** "Medium · 20 pts" plus the AI's one-line reason. */
export function Rating({ difficulty, reason }: { difficulty: Difficulty | null; reason: string | null }) {
  if (!difficulty) {
    return (
      <p className="flex items-center gap-2 text-body-sm text-muted">
        <span className="material-symbol text-base text-accent-text motion-safe:animate-pulse" aria-hidden>
          auto_awesome
        </span>
        Rating this task…
      </p>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <span className="material-symbol mt-0.5 text-base text-accent-text" aria-hidden>
        auto_awesome
      </span>
      <p className="text-body-sm text-muted">
        <span className="font-semibold text-ink">
          {DIFFICULTY_LABELS[difficulty]} · {pointsFor(difficulty)} pts.
        </span>{" "}
        {reason}
      </p>
    </div>
  );
}

/** Two-or-more option segmented choice, styled like the prototype's `sel()` buttons. */
export function ChoiceButton({ on, onClick, children, className = "" }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 rounded-chip px-3 text-body-sm font-semibold ${on ? "border-[1.5px] border-accent bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface))]" : "border border-line bg-surface"} ${className}`}
    >
      {children}
    </button>
  );
}
