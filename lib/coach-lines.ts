import type { CoachStyle } from "./theme";

// Static coach lines for the Today screen until the AI coach recap lands (build step 9).
// 1–3 sentences, max one emoji. The Roaster teases the effort, never the person.

export type CoachMoment = "empty" | "start" | "progress" | "clear";

const LINES: Record<CoachStyle, Record<CoachMoment, string>> = {
  hype: {
    empty: "Blank slate! Add one task and let's get this day MOVING.",
    start: "Day's loaded and waiting. Knock out the first one and the rest fall like dominoes!",
    progress: "You're cooking! Keep that streak of ticks going 🔥",
    clear: "EVERYTHING done?! Absolute machine. Go flex on the board.",
  },
  calm: {
    empty: "Nothing planned yet. Add the one thing that would make today feel good.",
    start: "One step at a time. Start with the smallest task and build from there.",
    progress: "Nice and steady. Take a breath, then pick the next one.",
    clear: "All done for today. Rest is part of the work too.",
  },
  roast: {
    empty: "An empty list. Bold strategy. Let's see if it pays off.",
    start: "Your tasks have been waiting so long they're filing a complaint.",
    progress: "Look at you, actually doing things. Don't stop now, it was just getting believable.",
    clear: "All done? Fine. I'll find something else to roast. Your rivals, maybe.",
  },
};

export const coachLine = (coach: CoachStyle, moment: CoachMoment) => LINES[coach][moment];
