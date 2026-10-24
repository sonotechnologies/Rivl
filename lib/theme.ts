// Shared theme constants. The CSS side lives in app/globals.css.

export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

export const ACCENTS = [
  { id: "volt", name: "Volt", hex: "#C6FF3D", textHex: "#4A7300" },
  { id: "pulse", name: "Pulse", hex: "#FF3D8B", textHex: "#C8005A" },
  { id: "ice", name: "Ice", hex: "#3DE1FF", textHex: "#00728A" },
  { id: "blaze", name: "Blaze", hex: "#FF7A1A", textHex: "#B04A00" },
  { id: "nova", name: "Nova", hex: "#9B5CFF", textHex: "#6E2FE0" },
  { id: "gold", name: "Gold", hex: "#FFC93D", textHex: "#8A6200" },
] as const;
export type Accent = (typeof ACCENTS)[number]["id"];

export const COACHES = [
  {
    id: "hype",
    name: "Hype Man",
    icon: "campaign",
    line: "THREE tasks before noon?! You're cooking. Keep going!",
  },
  {
    id: "calm",
    name: "Calm Mentor",
    icon: "eco",
    line: "One step at a time. Start with the smallest task and build from there.",
  },
  {
    id: "roast",
    name: "Savage Roaster",
    icon: "local_fire_department",
    line: "Zero tasks and it's 6 pm. Even your to-do list is bored.",
  },
] as const;
export type CoachStyle = (typeof COACHES)[number]["id"];

export const DEFAULT_THEME: Theme = "dark";
export const DEFAULT_ACCENT: Accent = "volt";
export const DEFAULT_COACH: CoachStyle = "hype";

export const THEME_COOKIE = "rivl-theme";
export const ACCENT_COOKIE = "rivl-accent";

export const isTheme = (v: unknown): v is Theme =>
  THEMES.includes(v as Theme);
export const isAccent = (v: unknown): v is Accent =>
  ACCENTS.some((a) => a.id === v);
export const isCoach = (v: unknown): v is CoachStyle =>
  COACHES.some((c) => c.id === v);

/** Applies a theme/accent to <html> and remembers it for the next load. */
export function applyTheme(theme: Theme, accent: Accent) {
  const el = document.documentElement;
  el.dataset.theme = theme;
  el.dataset.accent = accent;
  const age = 60 * 60 * 24 * 365;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${age}; SameSite=Lax`;
  document.cookie = `${ACCENT_COOKIE}=${accent}; path=/; max-age=${age}; SameSite=Lax`;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#F6F6F9" : "#0B0B10");
}

// Runs in <head> before first paint so the saved theme never flashes.
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,c=document.cookie,t=c.match(/(?:^|; )${THEME_COOKIE}=(dark|light)/),a=c.match(/(?:^|; )${ACCENT_COOKIE}=(${ACCENTS.map((a) => a.id).join("|")})/);if(t)d.dataset.theme=t[1];if(a)d.dataset.accent=a[1];}catch(e){}})()`;
