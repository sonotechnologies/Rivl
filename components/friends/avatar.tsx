import { ACCENTS } from "@/lib/theme";

/** Initials on a disc in the person's own accent colour. */
export function Avatar({ name, accent, size = 40 }: { name: string; accent?: string | null; size?: number }) {
  const hex = ACCENTS.find((a) => a.id === accent)?.hex ?? ACCENTS[0].hex;
  const initials =
    name
      .replace(/^@/, "")
      .split(/[\s._]+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="grid flex-none place-items-center rounded-full font-display font-bold text-[#0B0B10]"
      style={{ width: size, height: size, background: hex, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}
