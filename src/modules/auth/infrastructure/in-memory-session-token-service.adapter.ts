import type {
  SessionTokenService,
  SignedSession,
  SessionClaims,
} from '../application/ports/session-token-service.port';

// No real crypto — tests exercise orchestration, not jose itself (the real
// signing/verification is covered by exercising JoseSessionTokenService
// directly, not through this fake). A token is just a tagged, parseable
// string; anything else "verifies" to null, matching the port's contract of
// never throwing.
const PREFIX = 'fake-session-token:';

export class InMemorySessionTokenService implements SessionTokenService {
  private nextSessionId = 1;

  async sign(payload: { userId: number }): Promise<SignedSession> {
    // A distinct id per call, mirroring the real adapter, so tests can prove
    // two sessions are independently revocable.
    const sessionId = `session-${this.nextSessionId++}`;
    return { token: `${PREFIX}${payload.userId}:${sessionId}`, sessionId };
  }

  async verify(token: string): Promise<SessionClaims | null> {
    if (!token.startsWith(PREFIX)) return null;
    const [rawUserId, sessionId] = token.slice(PREFIX.length).split(':');
    const userId = Number(rawUserId);
    if (!Number.isInteger(userId) || !sessionId) return null;
    return { userId, sessionId };
  }
}
