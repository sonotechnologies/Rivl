import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "outline" | "ghost";

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 font-display text-body font-bold transition-[transform,background-color,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:opacity-90",
  outline: "border border-accent text-accent-text hover:bg-accent/10",
  ghost: "border border-line text-ink hover:bg-surface-2",
};

export const buttonClass = (variant: Variant = "primary", className = "") =>
  `${BASE} ${VARIANTS[variant]} ${className}`;

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
