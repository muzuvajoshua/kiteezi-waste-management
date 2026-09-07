import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// The reference's button: a full pill, generous padding, bold label.
//
// Separate from components/ui/button.tsx (shadcn) rather than replacing it.
// That one is wired into the app's existing controls with its own size and
// variant system; this is the marketing button, and the two want different
// proportions. Trying to serve both from one component is how a button ends up
// with a `marketing` variant nobody can reason about.

const VARIANTS = {
  /** The one action a band is asking for. */
  accent: "bg-accent-500 text-white hover:bg-accent-600 focus-visible:ring-accent-500",
  /** The brand green, for actions inside a cream or white band. */
  brand: "bg-brand-700 text-white hover:bg-brand-800 focus-visible:ring-brand-700",
  /** On a dark band, where a filled button would shout. */
  outline:
    "border border-white/25 text-white hover:border-white/50 hover:bg-white/5 focus-visible:ring-white",
  /** On a light band, same reasoning. */
  quiet:
    "border border-ink-900/15 text-ink-900 hover:border-ink-900/35 hover:bg-ink-900/5 focus-visible:ring-brand-700",
} as const;

const SIZES = {
  md: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
} as const;

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50";

export interface PillProps {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  className?: string;
  children: ReactNode;
}

const classesFor = ({ variant = "accent", size = "md", className }: PillProps) =>
  `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className ?? ""}`;

export function PillLink({
  variant,
  size,
  className,
  children,
  ...rest
}: PillProps & ComponentProps<typeof Link>) {
  return (
    <Link className={classesFor({ variant, size, className, children })} {...rest}>
      {children}
    </Link>
  );
}

export function PillButton({
  variant,
  size,
  className,
  children,
  ...rest
}: PillProps & ComponentProps<"button">) {
  return (
    <button className={classesFor({ variant, size, className, children })} {...rest}>
      {children}
    </button>
  );
}

/**
 * The orange circle with an icon in it — the reference uses this for its
 * phone, mail and address marks, and it is a large part of what makes the
 * palette feel warm rather than clinical.
 */
export function IconBadge({
  children,
  className,
  tone = "accent",
}: {
  children: ReactNode;
  className?: string;
  tone?: "accent" | "brand" | "outline";
}) {
  const tones = {
    accent: "bg-accent-500 text-white",
    brand: "bg-brand-700 text-white",
    outline: "border border-white/20 text-accent-500",
  } as const;

  return (
    <span
      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${tones[tone]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
