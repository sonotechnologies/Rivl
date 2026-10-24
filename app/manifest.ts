import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Rivl",
    short_name: "Rivl",
    description: "Get it done. Beat your friends.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0B10",
    theme_color: "#0B0B10",
    categories: ["productivity", "social"],
    shortcuts: [{ name: "Quick add", short_name: "Add", url: "/add", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
