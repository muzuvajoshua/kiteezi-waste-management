import { SESSION_MAX_AGE_SECONDS } from '../domain/session';
import type { SessionStore } from './ports/session-store.port';
import type { SessionTokenService } from './ports/session-token-service.port';
import type { SessionRepository } from './ports/session-repository.port';

/**
 * Mints a session token, records it server-side, and stores it in the cookie.
 *
 * The three steps belong together: a token with no record cannot be revoked,
 * and a record with no cookie signs nobody in. Shared by all three sign-in
 * paths (Google, password sign-in, registration) so none of them can forget
 * the recording half — which is what makes KWM-079's revocation work at all.
 *
 * The record is written BEFORE the cookie is set, so there is no window in
 * which a browser holds a token the server does not know about.
 */
export async function startSession(
  sessionTokenService: SessionTokenService,
  sessionStore: SessionStore,
  sessionRepository: SessionRepository,
  userId: number
): Promise<void> {
  const { token, sessionId } = await sessionTokenService.sign({ userId });

  await sessionRepository.create({
    sessionId,
    userId,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
  });

  await sessionStore.set(token);
}
