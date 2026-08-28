"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Google Identity Services (GIS) sign-in. Replaces Web3AuthProvider.
//
// GIS hands the browser an ID token directly, which we POST to
// /api/auth/session exactly as the Web3Auth flow did — so the server contract
// is unchanged. No npm dependency: the library is a script tag, which is also
// why three @web3auth packages, ethers and the Ankr RPC key could all go.
//
// The wallet apparatus that came with Web3Auth is gone deliberately: nothing
// in this application ever used it. Only getUserInfo()/idToken were consumed.

const GIS_SRC = "https://accounts.google.com/gsi/client";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

interface GoogleAuthContextValue {
  user: AuthUser | null;
  isReady: boolean;
  error: string | null;
  /** Renders Google's own button into `element`. GIS has no imperative sign-in. */
  renderButton: (element: HTMLElement) => void;
  logout: () => Promise<void>;
}

const GoogleAuthContext = createContext<GoogleAuthContextValue | null>(null);

const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || "";

interface CredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialised = useRef(false);

  // Exchanges the Google ID token for our own session cookie. The server
  // verifies the token against Google's JWKS (audience + issuer bound) and
  // returns the resolved user; the browser never decides who it is.
  const establishSession = useCallback(async (credential: string) => {
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: credential }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        // 409 is the deliberate refusal to auto-link an existing account by
        // email; its message is written for a person, so it is shown as-is.
        setError(body?.error ?? "Could not sign you in. Please try again.");
        return;
      }

      setError(null);
      setUser(body.user ?? null);
    } catch {
      setError("Could not reach the server. Please check your connection.");
    }
  }, []);

  // Restore an existing session on mount: the cookie outlives the page, so a
  // reload must not appear as a logout.
  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.user) setUser(data.user);
      })
      .catch(() => {
        /* not signed in — the normal case, not an error worth surfacing */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    if (!clientId) {
      setError("Sign-in is not configured (NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID is missing).");
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement("script");

    const onLoad = () => {
      const id = window.google?.accounts?.id;
      if (!id) {
        setError("Google sign-in failed to load.");
        return;
      }
      id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) void establishSession(response.credential);
        },
        cancel_on_tap_outside: true,
      });
      setIsReady(true);
    };

    if (existing) {
      onLoad();
    } else {
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = onLoad;
      script.onerror = () => setError("Google sign-in failed to load.");
      document.head.appendChild(script);
    }
  }, [establishSession]);

  const renderButton = useCallback((element: HTMLElement) => {
    window.google?.accounts?.id?.renderButton(element, {
      theme: "outline",
      size: "large",
      text: "signin_with",
    });
  }, []);

  const logout = useCallback(async () => {
    // Clears Google's one-tap state so the next sign-in prompts rather than
    // silently re-authenticating the same account.
    window.google?.accounts?.id?.disableAutoSelect();
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* the cookie is cleared server-side on the next successful call */
    }
    setUser(null);
  }, []);

  return (
    <GoogleAuthContext.Provider value={{ user, isReady, error, renderButton, logout }}>
      {children}
    </GoogleAuthContext.Provider>
  );
}

export function useGoogleAuth(): GoogleAuthContextValue {
  const ctx = useContext(GoogleAuthContext);
  if (!ctx) {
    throw new Error("useGoogleAuth must be used within a GoogleAuthProvider");
  }
  return ctx;
}
