import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { weekNumber, weekRange, type Recap } from "@/lib/recap";
import { createClient } from "@/lib/supabase/server";
import { ACCENTS } from "@/lib/theme";

/*
 * The shareable weekly recap (1080 × 1920, from "Rivl Weekly Recap" in the
 * design), drawn as a PNG for WhatsApp Status and Instagram Stories.
 * ?week=YYYY-MM-DD picks a week; ?task=0 hides the top task's title.
 */

const W = 1080;
const H = 1920;
const DISPLAY = "Space Grotesk";

const fonts = Promise.all([
  readFile(join(process.cwd(), "assets/fonts/SpaceGrotesk-Bold.ttf")),
  readFile(join(process.cwd(), "assets/fonts/Inter-SemiBold.ttf")),
]);

const PALETTE = {
  dark: { bg: "#0B0B10", surface: "#15151D", border: "#2A2A38", text: "#F4F4F8", muted: "#9A9AB0" },
  light: { bg: "#F6F6F9", surface: "#FFFFFF", border: "#DCDCE6", text: "#111118", muted: "#5E5E72" },
};

/** The outline of Material Symbols "local_fire_department", filled (viewBox 0 -960 960 960). */
const FLAME =
  "M480-840v132q0 34 23.5 57t57.5 23q18 0 33.5-7.5T622-658l18-22q74 42 117 117t43 163q0 134-93 227T480-80q-134 0-227-93t-93-227q0-129 86.5-245T480-840Z";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Sign in to see your recap.", { status: 401 });

  const week = request.nextUrl.searchParams.get("week");
  const { data, error } = await supabase.rpc("my_recap", /^\d{4}-\d{2}-\d{2}$/.test(week ?? "") ? { p_week: week } : {});
  const r = (data as Recap[] | null)?.[0];
  if (error || !r) return new Response("Couldn't load your week.", { status: 500 });

  const light = r.theme === "light";
  const c = PALETTE[light ? "light" : "dark"];
  const accent = ACCENTS.find((a) => a.id === r.accent) ?? ACCENTS[0];
  // Big accent type needs the darker shade on a light card to stay readable.
  const accentInk = light ? accent.textHex : accent.hex;
  const name = r.display_name?.split(" ")[0] ?? r.username ?? "I";
  const showTask = request.nextUrl.searchParams.get("task") !== "0" && Boolean(r.top_task);
  const people = r.people ?? 1;
  const host = (request.headers.get("x-forwarded-host") ?? request.nextUrl.host).replace(/^www\./, "");
  const [display, inter] = await fonts;

  const card = { padding: 40, borderRadius: 40, background: c.surface, border: `2px solid ${c.border}`, display: "flex" } as const;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, padding: "96px 88px", background: c.bg, color: c.text, display: "flex", flexDirection: "column", fontFamily: "Inter" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: 96, letterSpacing: "-0.04em", color: c.text, position: "relative" }}>
            <span>r</span>
            <span style={{ position: "relative", display: "flex" }}>
              ı
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  top: 18,
                  width: 21,
                  height: 21,
                  marginLeft: -10,
                  borderTop: `9px solid ${accent.hex}`,
                  borderLeft: `9px solid ${accent.hex}`,
                  transform: "rotate(45deg)",
                }}
              />
            </span>
            <span>vl</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 32, color: c.muted, lineHeight: 1.3 }}>
            <span>Week {weekNumber(r.week_start)}</span>
            <span>{weekRange(r.week_start)}</span>
          </div>
        </div>

        <div style={{ marginTop: 150, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 40, color: c.muted }}>{r.finished ? `${name} finished the week` : `${name}'s week so far`}</div>
          <div style={{ display: "flex", alignItems: "flex-start", marginTop: 8 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 120, lineHeight: 1, color: accentInk, marginTop: 60, marginRight: 12 }}>#</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 520, lineHeight: 0.8, letterSpacing: "-0.06em", color: accentInk }}>{r.rank ?? 1}</span>
          </div>
          <div style={{ fontSize: 48, marginTop: 24 }}>{people > 1 ? `of ${people} rivals` : "Solo week. Bring a rival."}</div>
        </div>

        <div style={{ marginTop: 96, display: "flex", flexWrap: "wrap", gap: 24 }}>
          <div style={{ ...card, width: 440, flexDirection: "column" }}>
            <div style={{ fontSize: 32, color: c.muted }}>Points</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 128, lineHeight: 1, marginTop: 16 }}>{(r.points ?? 0).toLocaleString("en-GB")}</div>
          </div>
          <div style={{ ...card, width: 440, flexDirection: "column" }}>
            <div style={{ fontSize: 32, color: c.muted }}>Streak</div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 16 }}>
              <svg width="112" height="112" viewBox="0 -960 960 960" style={{ marginRight: 12 }}>
                <defs>
                  <linearGradient id="g" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0" stopColor="#FF7A1A" />
                    <stop offset="1" stopColor="#FFC93D" />
                  </linearGradient>
                </defs>
                <path d={FLAME} fill="url(#g)" />
              </svg>
              <span style={{ fontFamily: DISPLAY, fontSize: 128, lineHeight: 1 }}>{r.streak ?? 0}</span>
            </div>
          </div>
          {showTask ? (
            <div style={{ ...card, width: 904, alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, marginRight: 32 }}>
                <div style={{ fontSize: 32, color: c.muted }}>Top task</div>
                <div style={{ fontFamily: DISPLAY, fontSize: 56, lineHeight: 1.15, marginTop: 12 }}>{r.top_task!.slice(0, 60)}</div>
              </div>
              <div style={{ display: "flex", background: accent.hex, color: "#0B0B10", fontFamily: DISPLAY, fontSize: 56, padding: "12px 32px", borderRadius: 999 }}>
                +{r.top_points ?? 0}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 56, lineHeight: 1.1, maxWidth: 560 }}>Get it done. Beat your friends.</div>
          <div style={{ fontFamily: DISPLAY, fontSize: host.length > 14 ? 40 : 56, color: accentInk }}>{host}</div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: DISPLAY, data: display, weight: 700, style: "normal" },
        { name: "Inter", data: inter, weight: 600, style: "normal" },
      ],
      headers: { "cache-control": "private, max-age=300" },
    },
  );
}
