import { DIFFICULTIES, DIFFICULTY_LABELS, pointsFor } from "@/lib/tasks/points";
import type { Difficulty } from "@/lib/tasks/types";

/** Five dots, filled up to the difficulty. */
export function Pips({ difficulty }: { difficulty: Difficulty | null }) {
  const d = difficulty ?? 0;
  return (
    <span className="flex gap-[3px]" role="img" aria-label={d ? `Difficulty ${d} of 5, ${DIFFICULTY_LABELS[difficulty!]}` : "Not rated yet"}>
      {DIFFICULTIES.map((n) => (
        <span key={n} className={`size-1.5 rounded-full ${n <= d ? "bg-accent-text" : "bg-line"}`} />
      ))}
    </span>
  );
}

/** Accent pill with a tabular point value. */
export function PointsPill({ points, muted = false, prefix = "" }: { points: number; muted?: boolean; prefix?: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 font-display text-[0.8125rem] leading-none font-bold tabular-nums ${muted ? "bg-surface-2 text-muted" : "bg-accent text-on-accent"}`}
    >
      {prefix}
      {points}
    </span>
  );
}

/** Row of 1–5 buttons. */
export function DifficultyPicker({ value, onChange }: { value: Difficulty | null; onChange: (d: Difficulty) => void }) {
  return (
    <div role="radiogroup" aria-label="Difficulty" className="grid grid-cols-5 gap-1.5">
      {DIFFICULTIES.map((n) => {
        const on = n === value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${n}, ${DIFFICULTY_LABELS[n]}, ${pointsFor(n)} points`}
            onClick={() => onChange(n)}
            className={`h-11 rounded-chip font-display text-body font-bold ${on ? "border-[1.5px] border-accent bg-accent text-on-accent" : "border border-line bg-bg text-ink"}`}
          >
            {n}
          </button>
        );
      })}
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
