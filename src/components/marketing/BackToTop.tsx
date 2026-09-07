"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

// The circular back-to-top button from the reference, bottom right.
//
// Hidden until there is something to scroll back from — a control that does
// nothing is worse than no control, and on a short viewport it would sit over
// the hero from the first frame.
//
// `scroll-behavior: smooth` is not set globally on purpose: it would also
// apply to the header's fragment links, and a smooth scroll to a fragment
// fights the sticky header on the way past. This asks for it per-click, and
// honours reduced motion by jumping instead.
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 800);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toTop = () =>
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      // Kept in the DOM rather than unmounted, so it can fade instead of
      // popping. `pointer-events-none` while hidden, or it would swallow
      // clicks on whatever sits underneath it.
      className={`fixed bottom-6 right-6 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-500 text-white shadow-lg outline-none transition-all hover:bg-accent-600 focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 ${
        visible ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
