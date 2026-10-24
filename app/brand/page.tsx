import type { Metadata } from "next";
import { AppIcon } from "@/components/brand/app-icon";
import { CoachBubble } from "@/components/brand/coach-bubble";
import { Logo } from "@/components/brand/logo";
import { contrastRatio, MIN_CONTRAST } from "@/lib/contrast";
import { ACCENTS, COACHES } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Brand system",
  description: "Rivl logo, colour tokens, contrast, type, spacing and coaches.",
};

const NEUTRALS = [
  ["--bg", "#0B0B10", "#F6F6F9"],
  ["--surface", "#15151D", "#FFFFFF"],
  ["--surface-2", "#1E1E29", "#EDEDF3"],
  ["--border", "#2A2A38", "#DCDCE6"],
  ["--text", "#F4F4F8", "#111118"],
  ["--text-muted", "#9A9AB0", "#5E5E72"],
] as const;

const NEUTRAL_MODES = [
  { name: "Dark (default)", col: 1, panel: "bg-[#15151D] text-[#F4F4F8] border-[#2A2A38]", swatchBorder: "#2A2A38" },
  { name: "Light", col: 2, panel: "bg-white text-[#111118] border-[#DCDCE6]", swatchBorder: "#DCDCE6" },
] as const;

const SEMANTIC = [
  { name: "Success", value: "#2ED47A", fill: "#2ED47A" },
  { name: "Danger", value: "#FF4D4F", fill: "#FF4D4F" },
  { name: "Streak flame", value: "#FF7A1A → #FFC93D", fill: "linear-gradient(0deg,#FF7A1A,#FFC93D)" },
];

const TYPE_SCALE = [
  { label: "64 · celebration", className: "font-display text-celebration font-bold tracking-[-0.02em]", sample: "#1" },
  { label: "40 · hero number", className: "font-display text-hero font-bold tracking-[-0.02em]", sample: "1,240 pts" },
  { label: "28 · heading", className: "font-display text-heading font-bold tracking-[-0.02em]", sample: "This week" },
  { label: "20 · title", className: "font-display text-title font-bold tracking-[-0.02em]", sample: "Quick add" },
  { label: "16 · body", className: "text-body", sample: "You're 40 pts behind Tobi. Fix that." },
  { label: "14 · body small", className: "text-body-sm", sample: "Tap a friend to nudge them." },
  { label: "12 · caption", className: "text-caption font-medium leading-normal", sample: "Due yesterday" },
];

const COACH_NOTES = { hype: "Accent at 15%", calm: "Soft teal at 12%", roast: "Hot pink at 12%" } as const;

const CONTRAST_COLUMNS = ["Accent", "On-accent text", "Dark · on bg", "Dark · on surface", "Light · on bg", "Light · on surface"];

type Check = { fg: string; bg: string; filled?: boolean };

function contrastChecks(hex: string, textHex: string): Check[] {
  return [
    { fg: hex, bg: "#0B0B10", filled: true },
    { fg: hex, bg: "#0B0B10" },
    { fg: hex, bg: "#15151D" },
    { fg: textHex, bg: "#F6F6F9" },
    { fg: textHex, bg: "#FFFFFF" },
  ];
}

const muted = "text-[#9A9AB0]";
const sectionTitle = "font-display text-heading font-bold leading-normal";
const caption = `text-body-sm leading-[1.5] ${muted} max-w-[40rem] text-pretty`;

export default function BrandPage() {
  return (
    // The brand sheet is a fixed dark Volt reference, whatever the viewer's theme.
    <div data-theme="dark" data-accent="volt" className="min-h-screen bg-[#0B0B10] text-[#F4F4F8]">
      <main className="mx-auto box-border flex max-w-[1280px] flex-col gap-[72px] px-[clamp(20px,5vw,72px)] pt-16 pb-[120px]">
        <header className="flex flex-col gap-2">
          <div className={`text-[0.8125rem] font-medium uppercase tracking-[0.08em] ${muted}`}>
            Brand &amp; theme system · v1
          </div>
          <h1 className="font-display text-[3rem] font-bold leading-[1.05] tracking-[-0.02em]">rivl</h1>
          <p className={`max-w-[40rem] text-body leading-[1.5] text-pretty ${muted}`}>
            A game lobby for getting things done. Competitive, energetic, a little cheeky, never childish.
          </p>
        </header>

        <section className="flex flex-col gap-5">
          <h2 className={sectionTitle}>Logo</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
            <div className="grid h-60 place-items-center rounded-[24px] border border-[#2A2A38] bg-[#15151D]">
              <Logo size="7.5rem" chevron="#C6FF3D" className="text-[#F4F4F8]" />
            </div>
            <div className="grid h-60 place-items-center rounded-[24px] bg-[#F6F6F9]">
              <Logo size="7.5rem" chevron="#111118" className="text-[#111118]" />
            </div>
          </div>
          <p className={caption}>
            Lowercase Space Grotesk 700, tracked −4%. The dot of the i becomes an upward chevron. On light grounds the
            chevron takes the ink colour.
          </p>
          <h3 className="mt-3 text-[0.9375rem] font-semibold">App icon</h3>
          <div className="flex flex-wrap gap-5">
            {ACCENTS.map((a) => (
              <div key={a.id} className="flex flex-col items-center gap-2">
                <AppIcon color={a.hex} />
                <span className={`text-[0.8125rem] font-medium ${muted}`}>{a.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {["Get it done. Beat your friends.", "Productivity, but make it competitive."].map((t) => (
              <span key={t} className="rounded-full border border-[#2A2A38] px-[18px] py-2.5 font-display text-body font-semibold leading-normal">
                {t}
              </span>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className={sectionTitle}>Neutrals</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
            {NEUTRAL_MODES.map((m) => (
              <div key={m.name} className={`flex flex-col gap-3 rounded-[16px] border p-5 ${m.panel}`}>
                <div className="text-[0.9375rem] font-semibold">{m.name}</div>
                {NEUTRALS.map((n) => (
                  <div key={n[0]} className="flex items-center gap-3">
                    <span
                      className="size-9 flex-none rounded-[10px]"
                      style={{ background: n[m.col], border: `1px solid ${m.swatchBorder}` }}
                    />
                    <span className="flex-1 font-mono text-[0.8125rem] font-medium">{n[0]}</span>
                    <span className="font-mono text-[0.8125rem] font-medium opacity-70">{n[m.col]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className={sectionTitle}>Accents and contrast</h2>
          <p className={`${caption} max-w-[45rem]`}>
            Each accent fills buttons and pills with #0B0B10 text on top. Accent-coloured text uses the base hex in dark
            mode and a darker text variant in light mode. Ratios are WCAG 2 and are calculated live, with 4.5:1 as the
            pass mark.
          </p>
          <div className="flex flex-col overflow-x-auto rounded-[16px] border border-[#2A2A38]">
            <div className="grid min-w-[820px] grid-cols-[160px_repeat(5,minmax(120px,1fr))] gap-3 bg-[#15151D] px-4 py-3 text-caption font-semibold uppercase tracking-[0.04em] text-[#9A9AB0]">
              {CONTRAST_COLUMNS.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            {ACCENTS.map((a) => (
              <div
                key={a.id}
                className="grid min-w-[820px] grid-cols-[160px_repeat(5,minmax(120px,1fr))] items-center gap-3 border-t border-[#2A2A38] px-4 py-3"
              >
                <div className="flex items-center gap-2.5">
                  <span className="size-9 flex-none rounded-[10px]" style={{ background: a.hex }} />
                  <div>
                    <div className="text-body-sm font-semibold leading-normal">{a.name}</div>
                    <div className={`font-mono text-[0.6875rem] font-medium ${muted}`}>
                      {a.hex} · {a.textHex}
                    </div>
                  </div>
                </div>
                {contrastChecks(a.hex, a.textHex).map(({ fg, bg, filled }, i) => {
                  const r = contrastRatio(fg, bg);
                  const ok = r >= MIN_CONTRAST;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span
                        className="grid h-7 w-10 flex-none place-items-center rounded-[8px] border border-[#2A2A38] font-display text-body-sm font-bold leading-normal"
                        style={filled ? { background: fg, color: bg } : { background: bg, color: fg }}
                      >
                        Aa
                      </span>
                      <span className="font-mono text-[0.8125rem] font-semibold tabular-nums">{r.toFixed(1)}:1</span>
                      <span
                        className={`rounded-[6px] px-1.5 py-0.5 text-[0.6875rem] font-semibold ${ok ? "bg-[#2ED47A]/16 text-[#2ED47A]" : "bg-[#FF4D4F]/16 text-[#FF4D4F]"}`}
                      >
                        {ok ? "Pass" : "Fail"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            {SEMANTIC.map((s) => (
              <div key={s.name} className="flex items-center gap-2.5">
                <span className="size-10 rounded-[12px]" style={{ background: s.fill }} />
                <div>
                  <div className="text-body-sm font-semibold leading-normal">{s.name}</div>
                  <div className={`font-mono text-caption font-medium ${muted}`}>{s.value}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className={sectionTitle}>Type</h2>
          <div className="flex flex-col border-t border-[#2A2A38]">
            {TYPE_SCALE.map((t) => (
              <div
                key={t.label}
                className="grid grid-cols-[140px_minmax(0,1fr)] items-baseline gap-4 border-b border-[#2A2A38] py-3.5"
              >
                <span className={`font-mono text-caption font-medium ${muted}`}>{t.label}</span>
                <span className={`${t.className} tabular-nums`}>{t.sample}</span>
              </div>
            ))}
          </div>
          <p className={caption}>
            Display: Space Grotesk 700 for headings, points, ranks and streaks. Body: Inter 400/500/600. Tabular figures
            wherever a score can change.
          </p>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className={sectionTitle}>Spacing and shape</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <SpecCard title="4 px grid" note="16 gutter · 12 between cards">
              <div className="flex items-end gap-2">
                {[4, 8, 12, 16, 24].map((s) => (
                  <span key={s} className="bg-[#C6FF3D]" style={{ width: s, height: s }} />
                ))}
              </div>
            </SpecCard>
            <SpecCard title="Radius" note="12 chips · 16 cards · 24 sheets · pill">
              <div className="flex items-end gap-2.5">
                <span className="size-11 rounded-[12px] border-[1.5px] border-[#9A9AB0]" />
                <span className="size-[52px] rounded-[16px] border-[1.5px] border-[#9A9AB0]" />
                <span className="size-[60px] rounded-t-[24px] border-[1.5px] border-b-0 border-[#9A9AB0]" />
                <span className="h-9 w-[72px] rounded-full border-[1.5px] border-[#9A9AB0]" />
              </div>
            </SpecCard>
            <SpecCard title="Depth" note="Surface steps and a 1 px border. Glow only on #1 and an active streak.">
              <div className="flex items-center gap-2.5">
                <span className="size-11 rounded-[12px] border border-[#2A2A38] bg-[#15151D]" />
                <span className="size-11 rounded-[12px] border border-[#2A2A38] bg-[#1E1E29]" />
                <span className="size-11 rounded-full bg-[#C6FF3D] shadow-glow" />
              </div>
            </SpecCard>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className={sectionTitle}>Coaches</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
            {COACHES.map((c) => (
              <CoachBubble key={c.id} coach={c.id} note={COACH_NOTES[c.id]}>
                {c.line}
              </CoachBubble>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function SpecCard({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-[#2A2A38] bg-[#15151D] p-5">
      <div className="text-body-sm font-semibold leading-normal">{title}</div>
      {children}
      <div className={`text-[0.8125rem] ${muted}`}>{note}</div>
    </div>
  );
}
