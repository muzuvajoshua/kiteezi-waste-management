"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Reveals its children once, when they first scroll into view.
//
// The reference does this on section entry — a short fade and a small rise.
// Two deliberate limits, because this effect is the single commonest tell of a
// generated page when it is overused:
//
//   1. Sections, not every card. A page where each individual tile floats up
//      in sequence reads as a template.
//   2. Once. `unobserve` after the first trigger, so nothing re-animates when
//      you scroll back up — content that keeps re-entering is distracting and
//      makes a page feel unfinished.
//
// It starts visible and hides itself on mount rather than starting hidden.
// Server-rendered HTML has no JavaScript yet, and a `reveal` that begins at
// opacity 0 in the markup means anyone with a slow connection, a blocked
// bundle or no JavaScript at all sees a blank page. This way the content is
// there first and the animation is an enhancement.

export function Reveal({
  children,
  delayMs = 0,
  className,
}: {
  children: ReactNode;
  /** For staggering a small group — keep it under ~200ms or it drags. */
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Already on screen at mount: leave it alone. Animating the hero on load
    // delays the first thing anyone reads.
    const box = node.getBoundingClientRect();
    if (box.top < window.innerHeight) return;

    setState("hidden");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setState("shown");
          observer.unobserve(entry.target);
        }
      },
      // A little before the edge, so the motion finishes about when the
      // section is properly in view rather than starting late.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={state === "shown" && delayMs > 0 ? { animationDelay: `${delayMs}ms` } : undefined}
      className={`${state === "hidden" ? "opacity-0" : ""} ${
        state === "shown" ? "animate-reveal" : ""
      } ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
