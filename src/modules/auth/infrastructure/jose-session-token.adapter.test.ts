import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JoseSessionTokenService } from './jose-session-token.adapter';

// The session token. Untested until now, and newly security-critical: it
// carries the session id that makes revocation possible (KWM-079), so a
// token without one, or with a forgeable one, breaks logout.

const service = () => new JoseSessionTokenService(3600);

beforeEach(() => {
  process.env.SESSION_SECRET = 'a-test-secret-at-least-32-bytes-long!';
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe('JoseSessionTokenService', () => {
  describe('signing', () => {
    it('round-trips the user id', async () => {
      const { token } = await service().sign({ userId: 7 });

      expect(await service().verify(token)).toMatchObject({ userId: 7 });
    });

    it('mints a session id and returns it to the caller', async () => {
      // The caller needs it to record the session server-side; without it
      // there is nothing to revoke.
      const { sessionId } = await service().sign({ userId: 7 });

      expect(sessionId).toBeTruthy();
      expect(sessionId.length).toBeGreaterThan(16);
    });

    it('puts that same session id in the token', async () => {
      const { token, sessionId } = await service().sign({ userId: 7 });

      expect(await service().verify(token)).toMatchObject({ sessionId });
    });

    it('mints a different session id every time', async () => {
      // Two sign-ins must be independently revocable — a shared id would
      // make logging out of one log out of all.
      const a = await service().sign({ userId: 7 });
      const b = await service().sign({ userId: 7 });

      expect(a.sessionId).not.toBe(b.sessionId);
    });
  });

  describe('verification', () => {
    it('returns null for a tampered token', async () => {
      const { token } = await service().sign({ userId: 7 });
      const [h, , s] = token.split('.');
      const forged = Buffer.from(JSON.stringify({ userId: 99, jti: 'x' })).toString('base64url');

      expect(await service().verify(`${h}.${forged}.${s}`)).toBeNull();
    });

    it('returns null for a token signed with a different secret', async () => {
      const { token } = await service().sign({ userId: 7 });
      process.env.SESSION_SECRET = 'a-completely-different-secret-value!!';

      expect(await service().verify(token)).toBeNull();
    });

    it('returns null for an expired token', async () => {
      const expired = new JoseSessionTokenService(-1);
      const { token } = await expired.sign({ userId: 7 });

      expect(await service().verify(token)).toBeNull();
    });

    it('returns null for a malformed token', async () => {
      expect(await service().verify('not-a-jwt')).toBeNull();
    });

    it('returns null rather than throwing, per the port contract', async () => {
      // get-current-user has no try/catch on this call. Throwing would turn
      // every expired cookie into a 500 instead of "please sign in".
      await expect(service().verify('garbage')).resolves.toBeNull();
    });

    it('rejects a token carrying no session id', async () => {
      // A pre-revocation token would verify but be unrevocable. Refusing it
      // forces re-authentication rather than silently granting an
      // untrackable session.
      const { SignJWT } = await import('jose');
      const legacy = await new SignJWT({ userId: 7 })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(process.env.SESSION_SECRET!));

      expect(await service().verify(legacy)).toBeNull();
    });
  });

  describe('configuration', () => {
    it('fails when SESSION_SECRET is missing rather than signing with a default', async () => {
      delete process.env.SESSION_SECRET;

      await expect(service().sign({ userId: 7 })).rejects.toThrow(/SESSION_SECRET/);
    });
  });
});
