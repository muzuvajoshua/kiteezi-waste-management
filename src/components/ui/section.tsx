import type { ReactNode } from "react";

// The section vocabulary: a band, a container, and a heading.
//
// Every band on the page goes through `Band`, so the page's rhythm is a
// sequence of tones rather than a pile of one-off paddings. That is the part of
// the reference that reads as "organised" — wide bands of alternating ground
// with consistent vertical space, not a continuous scroll of white.
//
// `SectionHeading` carries the reference's most identifiable habit: a short
// handwritten line in orange above a large, heavy, tight heading. It is one
// component so that habit cannot drift section to section.

const TONES = {
  /** The default page ground. Warm, so it does not read as a blank browser. */
  cream: "bg-cream-100 text-ink-900",
  /** For a band that should lift off the cream — cards, forms, tables. */
  white: "bg-white text-ink-900",
  /** The dark band. Used sparingly; it is what the eye lands on. */
  ink: "bg-ink-900 text-cream-100",
  /** Mid-green. For a single band that needs to feel like the brand itself. */
  brand: "bg-brand-700 text-white",
} as const;

export type BandTone = keyof typeof TONES;

export function Band({
  tone = "cream",
  id,
  className,
  children,
}: {
  tone?: BandTone;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      // scroll-mt clears the sticky header when a fragment link lands here.
      className={`scroll-mt-28 py-band lg:py-band-lg ${TONES[tone]} ${className ?? ""}`}
    >
      {children}
    </section>
  );
}

export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={`mx-auto max-w-6xl px-6 ${className ?? ""}`}>{children}</div>;
}

/** The mark that opens an eyebrow. Small, orange, four-pointed. */
function EyebrowMark() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 shrink-0 fill-accent-500">
      <path d="M6 0c.4 2.6 1.4 3.6 4 4-2.6.4-3.6 1.4-4 4-.4-2.6-1.4-3.6-4-4 2.6-.4 3.6-1.4 4-4Z" />
    </svg>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  tone = "light",
  align = "left",
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  /** Which ground it sits on, since the heading and lede colours differ. */
  tone?: "light" | "dark";
  align?: "left" | "center";
  className?: string;
}) {
  const dark = tone === "dark";
  const centred = align === "center";

  return (
    <div className={`${centred ? "mx-auto text-center" : ""} max-w-3xl ${className ?? ""}`}>
      <p
        className={`flex items-center gap-2 font-script text-2xl text-accent-500 ${
          centred ? "justify-center" : ""
        }`}
      >
        <EyebrowMark />
        {eyebrow}
      </p>

      {/*
        A heading, not a heading plus a highlighted word. Accenting one word in
        a headline is the commonest tell of a generated page, and the reference
        does not do it either — the emphasis is the size and the weight.
      */}
      <h2
        className={`mt-3 font-display text-display-sm font-bold sm:text-display-md ${
          dark ? "text-white" : "text-ink-900"
        }`}
      >
        {title}
      </h2>

      {lede !== undefined && (
        <p
          className={`mt-5 text-lg leading-relaxed ${
            dark ? "text-cream-300" : "text-ink-700/70"
          }`}
        >
          {lede}
        </p>
      )}
    </div>
  );
}
