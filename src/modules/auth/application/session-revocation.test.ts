import { describe, it, expect } from 'vitest';
import { InMemorySessionStore } from '../infrastructure/in-memory-session-store.adapter';
import { InMemorySessionTokenService } from '../infrastructure/in-memory-session-token-service.adapter';
import { InMemorySessionRepository } from '../infrastructure/in-memory-session-repository.adapter';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user-repository.adapter';
import { InMemoryRoleRepository } from '../infrastructure/in-memory-role-repository.adapter';
import { getCurrentUser } from './get-current-user.usecase';
import { logout } from './logout.usecase';
import { revokeUserSessions } from './revoke-user-sessions.usecase';

// KWM-079 — a session must be terminable server-side.
//
// The gap this closes: the cookie is a stateless JWT valid for seven days, so
// clearing it only removes the browser's copy. A cookie captured beforehand —
// XSS, a shared machine, a synced profile, a proxy log — kept working, and
// "log out" gave the user no protection they would reasonably assume.

function setup() {
  return {
    sessionStore: new InMemorySessionStore(),
    sessionTokenService: new InMemorySessionTokenService(),
    sessionRepository: new InMemorySessionRepository(),
    userRepository: new InMemoryUserRepository(),
    roleRepository: new InMemoryRoleRepository(),
  };
}

type Deps = ReturnType<typeof setup>;

/** Signs a user in the way the sign-in use-cases do, returning their cookie. */
async function signIn(deps: Deps, userId = 7): Promise<string> {
  deps.userRepository.seed({ id: userId, email: `u${userId}@example.com`, name: `User ${userId}` });
  deps.roleRepository.seedRoles(userId, ['citizen']);
  const { token, sessionId } = await deps.sessionTokenService.sign({ userId });
  await deps.sessionRepository.create({
    sessionId,
    userId,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  await deps.sessionStore.set(token);
  return token;
}

function resolve(deps: Deps) {
  return getCurrentUser(
    deps.sessionStore,
    deps.sessionTokenService,
    deps.sessionRepository,
    deps.userRepository,
    deps.roleRepository
  );
}

/** Simulates a copied cookie: the same token, presented from elsewhere. */
async function resolveWithCapturedCookie(deps: Deps, token: string) {
  const attackerJar = new InMemorySessionStore();
  await attackerJar.set(token);
  return getCurrentUser(
    attackerJar,
    deps.sessionTokenService,
    deps.sessionRepository,
    deps.userRepository,
    deps.roleRepository
  );
}

describe('session revocation', () => {
  describe('a live session', () => {
    it('resolves the user', async () => {
      const deps = setup();
      await signIn(deps);

      expect(await resolve(deps)).toMatchObject({ userId: 7, roles: ['citizen'] });
    });

    it('resolves from a copied cookie too — that is the problem being solved', async () => {
      const deps = setup();
      const token = await signIn(deps);

      expect(await resolveWithCapturedCookie(deps, token)).toMatchObject({ userId: 7 });
    });
  });

  describe('logout', () => {
    it('clears the browser cookie', async () => {
      const deps = setup();
      await signIn(deps);

      await logout(deps.sessionStore, deps.sessionTokenService, deps.sessionRepository);

      expect(await deps.sessionStore.get()).toBeNull();
    });

    it('REVOKES the session, so a captured cookie stops working', async () => {
      // The whole point. Before KWM-079 this returned the user for seven days.
      const deps = setup();
      const token = await signIn(deps);

      await logout(deps.sessionStore, deps.sessionTokenService, deps.sessionRepository);

      expect(await resolveWithCapturedCookie(deps, token)).toBeNull();
    });

    it('does not touch the user\'s other sessions', async () => {
      // Signing out of a laptop must not sign out the phone.
      const deps = setup();
      const laptop = await signIn(deps);
      const phone = await signIn(deps);
      await deps.sessionStore.set(laptop);

      await logout(deps.sessionStore, deps.sessionTokenService, deps.sessionRepository);

      expect(await resolveWithCapturedCookie(deps, laptop)).toBeNull();
      expect(await resolveWithCapturedCookie(deps, phone)).toMatchObject({ userId: 7 });
    });

    it('is safe to call with no session', async () => {
      const deps = setup();

      await expect(
        logout(deps.sessionStore, deps.sessionTokenService, deps.sessionRepository)
      ).resolves.toBeUndefined();
    });

    it('is safe to call twice', async () => {
      const deps = setup();
      await signIn(deps);
      await logout(deps.sessionStore, deps.sessionTokenService, deps.sessionRepository);

      await expect(
        logout(deps.sessionStore, deps.sessionTokenService, deps.sessionRepository)
      ).resolves.toBeUndefined();
    });
  });

  describe('a session with no server-side record', () => {
    it('is refused', async () => {
      // A forged or pre-revocation token verifies cryptographically but has
      // no record, so it must not authenticate anyone.
      const deps = setup();
      deps.userRepository.seed({ id: 7, email: 'u7@example.com', name: 'User 7' });
      const { token } = await deps.sessionTokenService.sign({ userId: 7 });
      await deps.sessionStore.set(token);

      expect(await resolve(deps)).toBeNull();
    });
  });

  describe('an expired session record', () => {
    it('is refused even if the token itself still verifies', async () => {
      // Belt and braces: the record's expiry is authoritative, so shortening
      // a session server-side takes effect without waiting for the JWT.
      const deps = setup();
      deps.userRepository.seed({ id: 7, email: 'u7@example.com', name: 'User 7' });
      const { token, sessionId } = await deps.sessionTokenService.sign({ userId: 7 });
      await deps.sessionRepository.create({
        sessionId,
        userId: 7,
        expiresAt: new Date(Date.now() - 1000),
      });
      await deps.sessionStore.set(token);

      expect(await resolve(deps)).toBeNull();
    });
  });

  describe('revoking every session for a user', () => {
    it('ends all of them and reports how many', async () => {
      const deps = setup();
      const laptop = await signIn(deps);
      const phone = await signIn(deps);

      const ended = await revokeUserSessions(deps.sessionRepository, 7);

      expect(ended).toEqual({ ok: true, value: { sessionsEnded: 2 } });
      expect(await resolveWithCapturedCookie(deps, laptop)).toBeNull();
      expect(await resolveWithCapturedCookie(deps, phone)).toBeNull();
    });

    it('leaves other users alone', async () => {
      const deps = setup();
      const mine = await signIn(deps, 7);
      const theirs = await signIn(deps, 8);

      await revokeUserSessions(deps.sessionRepository, 7);

      expect(await resolveWithCapturedCookie(deps, mine)).toBeNull();
      expect(await resolveWithCapturedCookie(deps, theirs)).toMatchObject({ userId: 8 });
    });

    it('reports zero when there is nothing to end', async () => {
      const deps = setup();

      expect(await revokeUserSessions(deps.sessionRepository, 999)).toEqual({
        ok: true,
        value: { sessionsEnded: 0 },
      });
    });

    it('does not double-count an already-revoked session', async () => {
      const deps = setup();
      await signIn(deps);
      await revokeUserSessions(deps.sessionRepository, 7);

      expect(await revokeUserSessions(deps.sessionRepository, 7)).toEqual({
        ok: true,
        value: { sessionsEnded: 0 },
      });
    });
  });
});
