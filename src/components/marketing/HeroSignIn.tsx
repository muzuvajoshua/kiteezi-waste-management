"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { GoogleAuthProvider } from "@/components/GoogleAuthProvider";
import { SignInPanel } from "@/components/auth/SignInPanel";
import { RecycleBall } from "@/components/marketing/RecycleBall";

// The hero's right column: the folded ball, and the sign-in card it unfolds
// into.
//
// Signing in happens here rather than on a page of its own. /sign-in used to
// live inside the app shell, which meant a signed-out visitor was shown a
// sidebar full of links they could not use in order to reach the one thing
// they could. The shell is now for people who are already signed in, and this
// is the way in.
//
// The card is the same SignInPanel that page used, so Google, email/password,
// registration and the forgot-password link all came across unchanged — this
// moved where sign-in lives, not how it works.
//
// The only client island on an otherwise static page: LandingPage stays a
// server component and this is the piece that needs state.

/**
 * How long the paper takes to open before the card appears. Matches the
 * `ball-unfold` keyframes in tailwind.config.ts — if the two drift, the card
 * either appears over a ball still flying apart or lands after a beat of
 * nothing.
 */
const UNFOLD_MS = 520;

/** The fragment that opens the card, so the header can link straight to it. */
export const SIGN_IN_HASH = "sign-in";

export function HeroSignIn() {
  const [unfolding, setUnfolding] = useState(false);
  const [open, setOpen] = useState(false);

  const openCard = useCallback(() => {
    if (open || unfolding) return;

    // Someone who has asked for less motion gets the card immediately rather
    // than half a second of nothing they can see.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOpen(true);
      return;
    }

    setUnfolding(true);
    window.setTimeout(() => setOpen(true), UNFOLD_MS);
  }, [open, unfolding]);

  // The header's Sign in link points at `/#sign-in`, so the hash is the one
  // mechanism both entry points share. It also means the card survives a
  // reload and can be linked to directly.
  useEffect(() => {
    const openIfHashMatches = () => {
      if (window.location.hash === `#${SIGN_IN_HASH}`) openCard();
    };

    openIfHashMatches();
    window.addEventListener("hashchange", openIfHashMatches);
    return () => window.removeEventListener("hashchange", openIfHashMatches);
  }, [openCard]);

  const close = () => {
    setOpen(false);
    setUnfolding(false);
    // Clear the fragment, or the card reopens on the next reload and the
    // close button appears to have done nothing.
    if (window.location.hash === `#${SIGN_IN_HASH}`) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  };

  if (open) {
    return (
      <div
        id={SIGN_IN_HASH}
        className="mx-auto w-full max-w-sm scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg motion-safe:animate-card-open lg:max-w-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink-900">Sign in</h2>
            <p className="mt-1 text-sm text-gray-600">
              Report waste in your area and earn points for every report.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close sign in"
            className="-m-2 rounded-lg p-2 text-gray-400 outline-none ring-brand-600 hover:text-ink-900 focus-visible:ring-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/*
          GoogleAuthProvider is mounted HERE rather than in the marketing
          layout, and only once the card is open.

          SignInPanel contains Google's button, which calls useGoogleAuth, so
          without a provider above it the whole page threw
          "useGoogleAuth must be used within a GoogleAuthProvider" the moment
          the card appeared. The first version of this test file mocked
          SignInPanel out, so nothing caught it until the page was opened in a
          browser.

          Mounting it lazily rather than in the layout keeps the cost where it
          belongs: the provider fetches /api/auth/me and loads Google's script
          on mount, and a visitor who never opens sign-in should pay for
          neither.
        */}
        <div className="mt-6 flex justify-center">
          <GoogleAuthProvider>
            <SignInPanel />
          </GoogleAuthProvider>
        </div>
      </div>
    );
  }

  return (
    <div id={SIGN_IN_HASH} className="mx-auto w-full max-w-sm scroll-mt-24 lg:max-w-none">
      <RecycleBall unfolding={unfolding} onUnfold={openCard} className="text-brand-700" />
    </div>
  );
}
