import { expect } from 'vitest';
import type { Role } from '../domain/role';
import type { InMemoryUserRepository } from '../infrastructure/in-memory-user-repository.adapter';
import type { InMemoryRoleRepository } from '../infrastructure/in-memory-role-repository.adapter';
import type { InMemorySessionStore } from '../infrastructure/in-memory-session-store.adapter';
import type { InMemorySessionTokenService } from '../infrastructure/in-memory-session-token-service.adapter';

// Test support for authorization tests on server actions. Not a test file
// itself (`.test-support.ts` sits outside Vitest's `*.test.ts` glob) and never
// imported by production code.
//
// Why substituting the auth composition root is the right seam:
//
//   - Server actions import their guards from presentation/auth-guards, which
//     resolves its adapters from presentation/composition. Swapping that one
//     module leaves the ENTIRE guard chain real — auth-guards, the require-*
//     use-cases, and the domain authorization policy all execute for real.
//     Only the four adapters behind it are in-memory, and those are the same
//     fakes the repository contract tests hold to the Drizzle behaviour.
//   - It also avoids `next/headers`: CookieSessionStore calls `cookies()`,
//     which throws "called outside a request scope" under Vitest. The
//     in-memory SessionStore is the port's other implementation, not a mock.
//   - And it avoids the eager `neon(process.env.DATABASE_URL!)` in
//     utils/db/dbConfig.ts, which throws at import time when DATABASE_URL is
//     unset — the reason no action had a test before this.
//
// USAGE — `vi.mock` is hoisted to the top of the *test file*, so the factory
// must be self-contained (no closure variables, or it fails with
// "userRepository is not defined"). Hence the two-part shape: the factory
// builds the module, and `authHarness()` reads those same instances back out
// of the mocked module at call time.
//
//   vi.mock('@/modules/auth/presentation/composition', async () => {
//     const { buildAuthComposition } = await import(
//       '@/modules/auth/presentation/action-auth.test-support'
//     );
//     return buildAuthComposition();
//   });
//
//   const auth = authHarness();
//   beforeEach(async () => { await auth.reset(); });
//
// Import the action under test dynamically inside each test
// (`await import('./report.actions')`) so it binds to the mocked composition.

const COMPOSITION_MODULE = '@/modules/auth/presentation/composition';

/**
 * The in-memory stand-in for the auth composition root. Call this from inside
 * a `vi.mock` factory; it must stay free of closure variables.
 */
export async function buildAuthComposition() {
  const { InMemoryUserRepository } = await import(
    '../infrastructure/in-memory-user-repository.adapter'
  );
  const { InMemoryRoleRepository } = await import(
    '../infrastructure/in-memory-role-repository.adapter'
  );
  const { InMemorySessionStore } = await import(
    '../infrastructure/in-memory-session-store.adapter'
  );
  const { InMemorySessionTokenService } = await import(
    '../infrastructure/in-memory-session-token-service.adapter'
  );
  const { InMemorySessionRepository } = await import(
    '../infrastructure/in-memory-session-repository.adapter'
  );

  return {
    userRepository: new InMemoryUserRepository(),
    roleRepository: new InMemoryRoleRepository(),
    sessionStore: new InMemorySessionStore(),
    sessionTokenService: new InMemorySessionTokenService(),
    sessionRepository: new InMemorySessionRepository(),
    // Sign-in is not exercised by action authorization tests; the identity
    // provider is covered directly in
    // infrastructure/web3auth-identity-provider.adapter.test.ts.
    identityProvider: {
      verifyToken: () => Promise.reject(new Error('not used in action authorization tests')),
    },
  };
}

/**
 * In-memory stand-in for the SHARED composition root
 * (@/shared/presentation/composition). Call from inside a `vi.mock` factory;
 * like buildAuthComposition it must stay free of closure variables.
 *
 * Needed because the real one constructs a Drizzle-backed rate limiter, which
 * reaches utils/db/dbConfig.ts and throws at import when DATABASE_URL is
 * unset — the same wall that made actions untestable before this file existed.
 */
export async function buildSharedComposition() {
  const { InMemoryRateLimiter } = await import(
    '@/shared/infrastructure/rate-limit/in-memory-rate-limiter.adapter'
  );
  const { InMemoryAuditLogger } = await import(
    '@/shared/infrastructure/audit/in-memory-audit-logger.adapter'
  );
  const { ConsoleEmailSender } = await import(
    '@/shared/infrastructure/email/console-email-sender.adapter'
  );
  return {
    rateLimiter: new InMemoryRateLimiter(),
    auditLogger: new InMemoryAuditLogger(),
    // Never sends; present so an action importing the shared root does not
    // construct the Resend adapter and read its configuration.
    emailSender: new ConsoleEmailSender(),
  };
}

export interface SignInOptions {
  readonly userId?: number;
  readonly email?: string;
  readonly name?: string;
  readonly roles?: readonly Role[];
}

export interface AuthHarness {
  /** Puts a signed-in user with the given roles behind the guards. */
  signInAs(options?: SignInOptions): Promise<{ userId: number }>;
  /** Clears the session, so the guards see an unauthenticated caller. */
  signOut(): Promise<void>;
  /**
   * Clears the session so each test starts unauthenticated. Call in
   * `beforeEach`.
   *
   * Seeded users and roles are intentionally left in place: `signInAs`
   * overwrites both for the id it signs in, and the guards only ever look up
   * the id carried by the current session token, so a leftover record for a
   * different id cannot influence a later test.
   */
  reset(): Promise<void>;
}

interface MockedShared {
  rateLimiter: { clear(): void };
  auditLogger: { clear(): void };
}

interface MockedComposition {
  userRepository: InMemoryUserRepository;
  roleRepository: InMemoryRoleRepository;
  sessionStore: InMemorySessionStore;
  sessionTokenService: InMemorySessionTokenService;
  sessionRepository: {
    create(input: { sessionId: string; userId: number; expiresAt: Date }): Promise<void>;
    clear(): void;
  };
}

// The single cast in this file. The mocked module's runtime exports are the
// in-memory adapters built above, but TypeScript still sees the production
// module's Drizzle/cookie types.
async function composition(): Promise<MockedComposition> {
  return (await import(COMPOSITION_MODULE)) as unknown as MockedComposition;
}

/** Drives the signed-in identity that the guards will resolve. */
export function authHarness(): AuthHarness {
  return {
    async signInAs(options: SignInOptions = {}) {
      const { userRepository, roleRepository, sessionStore, sessionTokenService, sessionRepository } =
        await composition();
      const userId = options.userId ?? 1;

      userRepository.seed({
        id: userId,
        email: options.email ?? `user${userId}@example.com`,
        name: options.name ?? `User ${userId}`,
      });
      roleRepository.seedRoles(userId, [...(options.roles ?? ['citizen'])]);
      // A real token minted through the real port, not a hand-forged cookie
      // value: getCurrentUser still verifies it before trusting the userId.
      // Since KWM-079 the matching session record is required too, or every
      // guard would refuse — so this mirrors what startSession does.
      const { token, sessionId } = await sessionTokenService.sign({ userId });
      await sessionRepository.create({
        sessionId,
        userId,
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      await sessionStore.set(token);

      return { userId };
    },

    async signOut() {
      const { sessionStore } = await composition();
      await sessionStore.clear();
    },

    async reset() {
      await this.signOut();
      // Counters are cleared too: every case in an action suite signs in as
      // the same default user, so a shared budget would run out partway
      // through and fail cases for the wrong reason.
      const shared = (await import('@/shared/presentation/composition')) as unknown as MockedShared;
      shared.rateLimiter.clear();
      shared.auditLogger.clear();
      (await composition()).sessionRepository.clear();
    },
  };
}

// --- Assertions on the action boundary -------------------------------------
//
// Since KWM-019, actions return `Result<T, AppError>` and never throw, so an
// authorization refusal is a returned `{ ok: false, error: { code } }` rather
// than a rejected promise. These two helpers live here rather than being
// repeated in each module's action test.

type RefusalCode = 'UNAUTHENTICATED' | 'FORBIDDEN';

interface ActionOutcome {
  readonly ok: boolean;
  readonly error?: { readonly code?: string; readonly message?: string };
}

/** Asserts the action refused the caller with exactly `code`. */
export async function expectRefused(call: Promise<unknown>, code: RefusalCode): Promise<void> {
  const outcome = (await call) as ActionOutcome;
  expect(outcome).toMatchObject({ ok: false, error: { code } });
}

/**
 * Asserts the action did NOT refuse the caller on authorization grounds.
 *
 * Deliberately not "ok === true": several actions legitimately fail for data
 * reasons under the in-memory fakes (a report id that was never seeded), and
 * that says nothing about authorization. Only UNAUTHENTICATED/FORBIDDEN
 * disqualify — so an over-strict guard is still caught, while unrelated data
 * failures do not raise false alarms.
 */
export async function expectAdmitted(call: Promise<unknown>): Promise<void> {
  const outcome = (await call) as ActionOutcome;
  const code = outcome.ok === false ? outcome.error?.code : undefined;
  if (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN') {
    throw new Error(
      `Expected the caller to be admitted, but the action refused with ${code}: ${outcome.error?.message ?? ''}`
    );
  }
}
