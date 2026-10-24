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

// Only the icons we use, so the icon font stays tiny. Keep names alphabetical.
const ICONS = ["campaign", "check", "chevron_left", "download", "eco", "ios_share", "local_fire_department", "mail", "settings"];
const ICON_FONT_URL = `https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0&icon_names=${ICONS.join(",")}&display=block`;

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
