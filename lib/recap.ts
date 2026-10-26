// The weekly recap card's data (my_recap in supabase/migrations/20261025000000_focus_recap.sql).

export type Recap = {
  week_start: string;
  finished: boolean;
  rank: number | null;
  people: number | null;
  points: number | null;
  streak: number | null;
  top_task: string | null;
  top_points: number | null;
  top_shared: boolean | null;
  display_name: string | null;
  username: string | null;
  accent: string | null;
  theme: string | null;
};

const parse = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** ISO week number of a Monday. */
export function weekNumber(mondayISO: string) {
  const d = parse(mondayISO);
  d.setUTCDate(d.getUTCDate() + 3); // Thursday decides the ISO year.
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

/** "Oct 19–25" or "Oct 27 – Nov 2". */
export function weekRange(mondayISO: string) {
  const start = parse(mondayISO);
  const end = new Date(start.getTime() + 6 * 864e5);
  const m = (d: Date) => d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return m(start) === m(end) ? `${m(start)} ${start.getUTCDate()}–${end.getUTCDate()}` : `${m(start)} ${start.getUTCDate()} – ${m(end)} ${end.getUTCDate()}`;
}
