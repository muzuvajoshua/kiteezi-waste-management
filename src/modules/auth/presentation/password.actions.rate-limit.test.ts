import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RATE_LIMITS } from '@/shared/presentation/rate-limit';

// Rate limiting on the sign-in and registration actions.
//
// This is the highest-value wiring in KWM-054: sign-in is the credential-
// stuffing target, and #119 shipped it explicitly unthrottled. Without these
// cases, deleting either bucket leaves the whole suite green — confirmed by
// mutation, which is why this file exists.

vi.mock('@/shared/presentation/composition', async () => {
  const { buildSharedComposition } = await import('./action-auth.test-support');
  return buildSharedComposition();
});

// The real password composition reaches Drizzle at import; the use-cases
// themselves are covered directly elsewhere, so they are stubbed to a fixed
// rejection here. What is under test is whether the limit runs at all, and
// with which keys.
const establishSessionFromPassword = vi.hoisted(() => vi.fn());
const registerWithPassword = vi.hoisted(() => vi.fn());

vi.mock('../application/establish-session-from-password.usecase', () => ({
  establishSessionFromPassword,
}));
vi.mock('../application/register-with-password.usecase', () => ({ registerWithPassword }));
vi.mock('./composition', () => ({
  passwordHasher: {},
  identityRepository: {},
  userRepository: {},
  roleRepository: {},
  sessionTokenService: {},
  sessionStore: {},
  sessionRepository: {},
}));

// Server actions read the caller's IP from request headers, which do not
// exist under Vitest. A controllable stub is the only way to assert that
// per-IP bucketing is keyed on what it claims to be.
let currentIp = '203.0.113.5';
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': currentIp }),
}));

async function actions() {
  return import('./password.actions');
}

beforeEach(async () => {
  currentIp = '203.0.113.5';
  establishSessionFromPassword.mockReset();
  registerWithPassword.mockReset();
  establishSessionFromPassword.mockResolvedValue({
    ok: false,
    error: { code: 'UNAUTHENTICATED', message: 'Incorrect email address or password.' },
  });
  registerWithPassword.mockResolvedValue({
    ok: true,
    value: { id: 1, email: 'citizen@example.com', name: 'Citizen' },
  });

  const shared = (await import('@/shared/presentation/composition')) as unknown as {
    rateLimiter: { clear(): void };
  };
  shared.rateLimiter.clear();
});

function signIn(email = 'victim@example.com', password = 'guess') {
  return actions().then((m) => m.signInWithEmailPassword(email, password));
}

describe('sign-in rate limiting', () => {
  const PER_EMAIL = RATE_LIMITS.signInPerEmail.limit;

  it('allows a plausible number of mistyped passwords', async () => {
    for (let i = 0; i < PER_EMAIL; i += 1) {
      expect(await signIn()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    }
  });

  it('refuses with RATE_LIMITED once the per-email budget is spent', async () => {
    for (let i = 0; i < PER_EMAIL; i += 1) await signIn();

    expect(await signIn()).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });

  it('stops verifying the password once refused', async () => {
    // The limit must stop the expensive work. If the use-case still ran, an
    // attacker would keep paying scrypt's cost on our CPU for free.
    for (let i = 0; i < PER_EMAIL; i += 1) await signIn();
    establishSessionFromPassword.mockClear();

    await signIn();

    expect(establishSessionFromPassword).not.toHaveBeenCalled();
  });

  it('keeps limiting one account even when the attacker rotates IP', async () => {
    // The point of keying on the email: addresses are cheap to rotate, the
    // targeted account is not.
    for (let i = 0; i < PER_EMAIL; i += 1) {
      currentIp = `198.51.100.${i}`;
      await signIn();
    }
    currentIp = '198.51.100.200';

    expect(await signIn()).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });

  it('does not let one targeted account lock out a different one', async () => {
    for (let i = 0; i < PER_EMAIL; i += 1) await signIn('victim@example.com');

    expect(await signIn('someone-else@example.com')).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('treats an address differing only in case as the same account', async () => {
    for (let i = 0; i < PER_EMAIL; i += 1) await signIn('victim@example.com');

    expect(await signIn('Victim@EXAMPLE.com')).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('also limits per IP across many different accounts', async () => {
    // Credential stuffing spreads across accounts, so the per-email bucket
    // never trips; the per-IP backstop is what catches it.
    const perIp = RATE_LIMITS.signInPerIp.limit;
    for (let i = 0; i < perIp; i += 1) await signIn(`user${i}@example.com`);

    expect(await signIn('yet-another@example.com')).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
  });
});

describe('registration rate limiting', () => {
  it('refuses once the per-IP budget is spent', async () => {
    const limit = RATE_LIMITS.registerPerIp.limit;
    const register = async (i: number) =>
      (await actions()).registerWithEmailPassword(`new${i}@example.com`, 'correct horse battery');

    for (let i = 0; i < limit; i += 1) {
      expect(await register(i)).toMatchObject({ ok: true });
    }

    expect(await register(999)).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });

  it('is keyed on IP, not the submitted address', async () => {
    // Keying registration on the email would let an attacker mint a fresh
    // budget per address — the opposite of a limit, since the address is the
    // thing they are free to vary.
    const limit = RATE_LIMITS.registerPerIp.limit;
    for (let i = 0; i < limit; i += 1) {
      await (await actions()).registerWithEmailPassword(`a${i}@example.com`, 'correct horse battery');
    }

    expect(
      await (await actions()).registerWithEmailPassword('brand-new@example.com', 'correct horse battery')
    ).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });
});
