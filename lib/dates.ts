// Calendar helpers. Days are local YYYY-MM-DD strings so "today" means the
// user's today, not the server's.

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISODate(new Date());

export function addDays(iso: string, days: number) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Monday of the week containing `iso` (the leaderboard resets Monday 00:00). */
export function weekStartISO(iso = todayISO()) {
  const d = fromISODate(iso);
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return toISODate(d);
}

/** "17:00:00" → "5 pm", "09:30" → "9:30 am". */
export function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 || 12;
  return m ? `${hour}:${pad(m)} ${suffix}` : `${hour} ${suffix}`;
}

/** "Today", "Tomorrow", "Yesterday", or "Mon 27 Oct". */
export function formatDay(iso: string, today = todayISO()) {
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  if (iso === addDays(today, -1)) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(fromISODate(iso));
}

export function greeting(hour = new Date().getHours()) {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}
