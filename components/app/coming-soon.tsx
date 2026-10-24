import { CoachBubble } from "@/components/brand/coach-bubble";

/** Holding screen for tabs that land in a later build step. */
export function ComingSoon({ title, icon, line }: { title: string; icon: string; line: string }) {
  return (
    <div className="flex flex-col gap-6 pt-1">
      <h1 className="font-display text-heading font-bold tracking-[-0.02em]">{title}</h1>
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line px-4 py-10 text-center">
        <div className="grid size-18 place-items-center rounded-full border-2 border-line text-muted">
          <span className="material-symbol icon-outline text-[2.5rem]" aria-hidden>
            {icon}
          </span>
        </div>
        <p className="font-display text-title font-bold">Coming soon</p>
      </div>
      <CoachBubble coach="hype">{line}</CoachBubble>
    </div>
  );
}
