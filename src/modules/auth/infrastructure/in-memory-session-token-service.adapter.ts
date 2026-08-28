import type { SessionTokenService } from '../application/ports/session-token-service.port';

// No real crypto — tests exercise orchestration, not jose itself (the real
// signing/verification is covered by exercising JoseSessionTokenService
// directly, not through this fake). A token is just a tagged, parseable
// string; anything else "verifies" to null, matching the port's contract of
// never throwing.
const PREFIX = 'fake-session-token:';

export class InMemorySessionTokenService implements SessionTokenService {
  async sign(payload: { userId: number }): Promise<string> {
    return `${PREFIX}${payload.userId}`;
  }

  async verify(token: string): Promise<{ userId: number } | null> {
    if (!token.startsWith(PREFIX)) return null;
    const userId = Number(token.slice(PREFIX.length));
    return Number.isInteger(userId) ? { userId } : null;
  }
}
