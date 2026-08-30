import type { SessionStore } from './ports/session-store.port';
import type { SessionTokenService } from './ports/session-token-service.port';
import type { SessionRepository } from './ports/session-repository.port';

/**
 * Ends the current session.
 *
 * Revokes the server-side record BEFORE clearing the cookie. Clearing alone
 * only removes the browser's copy — a cookie captured beforehand kept working
 * until the JWT expired, which is up to seven days after the user believed
 * they had logged out (KWM-079).
 *
 * Only this session is revoked. Signing out of a laptop must not sign out the
 * phone; ending every session is a separate, deliberate action
 * (revoke-user-sessions.usecase.ts).
 *
 * Safe to call with no session and safe to call twice — both are ordinary
 * outcomes of a user clicking twice or a stale tab.
 */
export async function logout(
  sessionStore: SessionStore,
  sessionTokenService: SessionTokenService,
  sessionRepository: SessionRepository
): Promise<void> {
  const token = await sessionStore.get();

  if (token) {
    const claims = await sessionTokenService.verify(token);
    if (claims) await sessionRepository.revoke(claims.sessionId);
  }

  // Cleared even when the token was unreadable, so a corrupt cookie does not
  // strand the user in a state they cannot click their way out of.
  await sessionStore.clear();
}
