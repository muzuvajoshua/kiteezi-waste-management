import { cookies } from 'next/headers';
import type { SessionStore } from '../application/ports/session-store.port';

const isProd = process.env.NODE_ENV === 'production';

// `__Host-` cookies are only valid when they carry the `Secure` attribute,
// which browsers refuse over plain-http (local dev / LAN). Use the
// hardened name + Secure in production and a plain cookie in development so
// local testing works without TLS.
export const SESSION_COOKIE = isProd ? '__Host-session' : 'session';

export class CookieSessionStore implements SessionStore {
  constructor(private readonly maxAgeSeconds: number) {}

  async get(): Promise<string | null> {
    const store = await cookies();
    return store.get(SESSION_COOKIE)?.value ?? null;
  }

  async set(token: string): Promise<void> {
    const store = await cookies();
    store.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: this.maxAgeSeconds,
    });
  }

  async clear(): Promise<void> {
    const store = await cookies();
    store.set(SESSION_COOKIE, '', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
}
