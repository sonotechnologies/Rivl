import type { CSSProperties } from "react";

type LogoProps = {
  /** Font size of the wordmark; every part of the mark scales from it. */
  size?: CSSProperties["fontSize"];
  /** Chevron colour. Defaults to --logo-chevron (accent on dark, ink on light). */
  chevron?: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * The "rivl" wordmark: lowercase Space Grotesk 700 tracked −4%, with the
 * dot of the dotless i drawn as an upward chevron.
 */
export function Logo({ size = "2rem", chevron = "var(--logo-chevron)", className, style }: LogoProps) {
  return (
    <span
      role="img"
      aria-label="rivl"
      className={`font-display inline-flex font-bold leading-none ${className ?? ""}`}
      style={{ fontSize: size, letterSpacing: "-0.04em", ...style }}
    >
      <span aria-hidden className="inline-flex">
        r
        <span className="relative">
          ı
          <span
            className="absolute"
            style={{
              left: "50%",
              top: ".12em",
              width: ".22em",
              height: ".22em",
              borderTop: `.09em solid ${chevron}`,
              borderLeft: `.09em solid ${chevron}`,
              transform: "translateX(-50%) rotate(45deg)",
            }}
          />
        </span>
        vl
      </span>
    </span>
  );
}
