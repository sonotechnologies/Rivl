import { COACHES, type CoachStyle } from "@/lib/theme";

export const COACH_TINTS: Record<CoachStyle, { tint: string; pct: number; ink: string }> = {
  hype: { tint: "var(--accent)", pct: 15, ink: "var(--accent-text)" },
  calm: { tint: "#2EC4B6", pct: 12, ink: "var(--coach-calm-ink)" },
  roast: { tint: "#FF3D8B", pct: 12, ink: "var(--coach-roast-ink)" },
};

type CoachBubbleProps = {
  coach: CoachStyle;
  children: React.ReactNode;
  /** Extra text after the coach name in the label, e.g. "Accent at 15%". */
  note?: string;
};

/** Speech bubble with the coach's icon, tinted per personality. */
export function CoachBubble({ coach, children, note }: CoachBubbleProps) {
  const { name, icon } = COACHES.find((c) => c.id === coach)!;
  const { tint, pct, ink } = COACH_TINTS[coach];
  const background = `color-mix(in oklab, ${tint} ${pct}%, var(--surface))`;

  return (
    <div className="flex items-start gap-2.5">
      <div
        className="grid size-9 flex-none place-items-center rounded-full"
        style={{ background, color: ink }}
        aria-hidden
      >
        <span className="material-symbol text-xl">{icon}</span>
      </div>
      <div className="flex-1 px-3.5 py-2.5" style={{ background, borderRadius: "4px 16px 16px 16px" }}>
        <div className="mb-[3px] text-caption font-semibold" style={{ color: ink }}>
          {name}
          {note ? ` · ${note}` : null}
        </div>
        <div className="text-[0.9375rem] leading-[1.4] text-pretty">{children}</div>
      </div>
    </div>
  );
}
