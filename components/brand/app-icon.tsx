import { Logo } from "./logo";

type AppIconProps = {
  /** Edge length in px. The mark is 44/96 of it, the radius 24/96. */
  size?: number;
  /** Fill colour; defaults to the current accent. */
  color?: string;
  className?: string;
};

/** The wordmark in #0B0B10 on an accent tile. */
export function AppIcon({ size = 96, color = "var(--accent)", className }: AppIconProps) {
  return (
    <span
      className={`grid place-items-center ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        background: color,
        color: "#0B0B10",
      }}
    >
      <Logo size={(size * 44) / 96} chevron="#0B0B10" />
    </span>
  );
}
