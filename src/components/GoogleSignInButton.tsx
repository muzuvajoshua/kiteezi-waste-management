"use client";

import { useEffect, useRef } from "react";
import { useGoogleAuth } from "@/components/GoogleAuthProvider";

// Google Identity Services renders its own button — the branding and the
// click handler are owned by GIS, so this is a mount point plus the states
// GIS cannot express (not ready, misconfigured, sign-in failed).
export function GoogleSignInButton() {
  const { isReady, error, renderButton } = useGoogleAuth();
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isReady && target.current) renderButton(target.current);
  }, [isReady, renderButton]);

  return (
    <div className="flex flex-col items-end gap-1">
      <div ref={target} aria-label="Sign in with Google" />
      {!isReady && !error && <span className="text-xs text-gray-500">Loading sign-in…</span>}
      {error && (
        <span role="alert" className="max-w-xs text-right text-xs text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
