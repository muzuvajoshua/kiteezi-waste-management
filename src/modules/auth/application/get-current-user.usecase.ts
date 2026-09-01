import type { CurrentUser } from '../domain/current-user';
import type { SessionStore } from './ports/session-store.port';
import type { SessionTokenService } from './ports/session-token-service.port';
import type { SessionRepository } from './ports/session-repository.port';
import type { UserRepository } from './ports/user-repository.port';
import type { RoleRepository } from './ports/role-repository.port';

// Resolves the current identity from the session token, with roles loaded
// fresh from the database (never cached in the token) so a revoked grant
// takes effect immediately.
//
// Since KWM-079 the token is not sufficient on its own: a matching, unrevoked
// session record must also exist. A stateless JWT cannot be withdrawn before
// it expires, so without this check "log out" left a captured cookie working
// for seven days. The cost is one extra read per authenticated request; that
// is the price of revocation, paid deliberately.
//
// Deliberately returns `CurrentUser | null` rather than `Result<...>`, and
// has NO try/catch of its own: "no/invalid/revoked session" is an expected,
// common outcome (null), not a failure to report — but a genuine repository
// fault (e.g. the database is down) is a real fault and must propagate as an
// exception, not be silently reinterpreted as "not logged in". Do not add a
// defensive try/catch anywhere in this call chain (this use-case,
// require-authenticated.usecase.ts, or presentation/auth-guards.ts) that
// would swallow an unexpected error back into a false "unauthenticated" —
// that reintroduces the exact bug this shape is designed to avoid.
export async function getCurrentUser(
  sessionStore: SessionStore,
  sessionTokenService: SessionTokenService,
  sessionRepository: SessionRepository,
  userRepository: UserRepository,
  roleRepository: RoleRepository
): Promise<CurrentUser | null> {
  const token = await sessionStore.get();
  if (!token) return null;

  const claims = await sessionTokenService.verify(token);
  if (!claims) return null;

  // A cryptographically valid token with no record — forged against a leaked
  // secret, or minted before sessions were tracked — must not authenticate.
  const session = await sessionRepository.findById(claims.sessionId);
  if (!session) return null;
  if (session.revokedAt !== null) return null;
  // The record's expiry is authoritative as well as the token's, so a session
  // can be shortened server-side without waiting for the JWT to lapse.
  if (session.expiresAt.getTime() <= Date.now()) return null;

  const user = await userRepository.getUserById(claims.userId);
  if (!user) return null;

  const roles = await roleRepository.getUserRoles(user.id);
  return { userId: user.id, email: user.email, name: user.name, roles };
}
