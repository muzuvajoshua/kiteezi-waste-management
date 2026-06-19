"use client";

import { useEffect, useState } from "react";

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

/**
 * Resolves the current user from the server session cookie via /api/auth/me.
 * Identity is derived from the HTTP-only session cookie, never from
 * localStorage — clearing localStorage mid-session has no effect.
 */
export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (active) setUser(data.user ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { user, isLoading };
}
