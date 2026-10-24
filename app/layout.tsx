import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { DEFAULT_ACCENT, DEFAULT_THEME, THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["500"],
});

// Only the icons we use, so the icon font stays tiny.
const ICONS = [
  "add", "arrow_back", "auto_awesome", "campaign", "chat", "check", "check_circle", "chevron_left", "cleaning_services",
  "close", "cloud_off", "content_copy", "dark_mode", "delete", "download", "dynamic_feed", "eco", "edit", "event_upcoming",
  "expand_less", "expand_more", "fitness_center", "ios_share", "leaderboard", "light_mode", "local_fire_department", "lock",
  "mail", "military_tech", "more_horiz", "person", "repeat", "schedule", "settings", "swords", "sync", "task_alt", "today",
  "wb_twilight", "workspace_premium", "group", "person_add", "person_remove", "qr_code_2", "share", "search", "block", "flag", "timer", "arrow_upward", "arrow_downward", "chevron_right", "emoji_events", "handshake", "hourglass_empty", "verified", "add_a_photo",
];
const ICON_FONT_URL = `https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400..700,0..1,0&icon_names=${[...ICONS].sort().join(",")}&display=block`;

export const metadata: Metadata = {
  title: { default: "Rivl", template: "%s · Rivl" },
  description: "Get it done. Beat your friends. The to-do app where your crew competes on a weekly leaderboard.",
  applicationName: "Rivl",
  appleWebApp: { capable: true, title: "Rivl", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      data-accent={DEFAULT_ACCENT}
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={ICON_FONT_URL} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
