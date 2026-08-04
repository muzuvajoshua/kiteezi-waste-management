import { SignJWT, jwtVerify } from 'jose';
import type { SessionTokenService } from '../application/ports/session-token-service.port';

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not set');
  }
  return new TextEncoder().encode(secret);
}

export class JoseSessionTokenService implements SessionTokenService {
  constructor(private readonly maxAgeSeconds: number) {}

  async sign(payload: { userId: number }): Promise<string> {
    return new SignJWT({ userId: payload.userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${this.maxAgeSeconds}s`)
      .sign(secretKey());
  }

  // This try/catch is deliberate — NOT the "adapters propagate raw errors"
  // pattern used for the Drizzle adapters in this module. A tampered,
  // expired, or wrong-secret token is an EXPECTED outcome (every session
  // expires eventually; that's not an infra fault) being translated into
  // this port's documented `{userId}|null` contract. Removing this would
  // turn every expired cookie into a raw, uncaught 500 instead of "please
  // log in again" once get-current-user.usecase.ts's un-caught chain picks
  // it up — see that file's docstring for the failure mode this avoids.
  async verify(token: string): Promise<{ userId: number } | null> {
    try {
      const { payload } = await jwtVerify(token, secretKey());
      if (typeof payload.userId !== 'number') return null;
      return { userId: payload.userId };
    } catch {
      return null;
    }
  }
}
