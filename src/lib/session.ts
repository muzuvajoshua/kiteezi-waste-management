import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

// `__Host-` cookies are only valid when they carry the `Secure` attribute,
// which browsers refuse over plain-http (local dev / LAN). Use the hardened
// name + Secure in production and a plain cookie in development so local
// testing works without TLS.
const isProd = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = isProd ? "__Host-session" : "session";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

// The session cookie is an identity anchor only: it carries the signed userId
// and nothing else. Roles are resolved from the database on each authorization
// check (see lib/rbac.ts) so they are never stale and a revoked grant takes
// effect immediately — the cookie is trusted for *who*, never for *what*.
export interface SessionPayload {
  userId: number;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function getServerSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.userId !== "number") return null;
    return { userId: payload.userId };
  } catch {
    // Tampered, expired, or wrong-secret tokens resolve to "no session".
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
