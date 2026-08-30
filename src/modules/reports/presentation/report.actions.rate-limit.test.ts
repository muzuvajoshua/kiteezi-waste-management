import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authHarness } from '@/modules/auth/presentation/action-auth.test-support';
import { RATE_LIMITS } from '@/shared/presentation/rate-limit';

// Proves the limit is WIRED INTO the action, not merely that the limiter
// works. The limiter has its own tests; this is the equivalent of the
// authorization suites — without it, deleting `enforceRateLimit` from an
// action would leave every other test green.

vi.mock('@/shared/presentation/composition', async () => {
  const { buildSharedComposition } = await import(
    '@/modules/auth/presentation/action-auth.test-support'
  );
  return buildSharedComposition();
});

vi.mock('@/modules/auth/presentation/composition', async () => {
  const { buildAuthComposition } = await import(
    '@/modules/auth/presentation/action-auth.test-support'
  );
  return buildAuthComposition();
});

const auth = authHarness();

vi.mock('./composition', async () => {
  const { InMemoryReportRepository } = await import(
    '../infrastructure/in-memory-report-repository.adapter'
  );
  const { InMemoryReportTransactionManager } = await import(
    '../infrastructure/in-memory-report-write-unit-of-work.adapter'
  );
  return {
    reportRepository: new InMemoryReportRepository(),
    reportTransactionManager: new InMemoryReportTransactionManager(),
  };
});

vi.mock('@/modules/notifications/presentation/composition', async () => {
  const { InMemoryNotificationRepository } = await import(
    '@/modules/notifications/infrastructure/in-memory-notification-repository.adapter'
  );
  return { notificationRepository: new InMemoryNotificationRepository() };
});

beforeEach(async () => {
  await auth.reset();
});

async function submitReport() {
  const { createReport } = await import('./report.actions');
  return createReport('Kiteezi, Zone 3', 'plastic', '2');
}

const LIMIT = RATE_LIMITS.mutationPerUser.limit;

describe('createReport rate limiting', () => {
  it('allows a normal number of submissions', async () => {
    await auth.signInAs({ userId: 1, roles: ['citizen'] });

    for (let i = 0; i < LIMIT; i += 1) {
      expect(await submitReport()).toMatchObject({ ok: true });
    }
  });

  it('refuses with RATE_LIMITED once the budget is spent', async () => {
    await auth.signInAs({ userId: 1, roles: ['citizen'] });
    for (let i = 0; i < LIMIT; i += 1) await submitReport();

    expect(await submitReport()).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('tells the caller how long to wait', async () => {
    await auth.signInAs({ userId: 1, roles: ['citizen'] });
    for (let i = 0; i < LIMIT; i += 1) await submitReport();

    const result = await submitReport();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/try again in \d+ seconds?/i);
  });

  it('does not create the report once refused', async () => {
    // The limit must stop the work, not merely report afterwards.
    await auth.signInAs({ userId: 1, roles: ['citizen'] });
    for (let i = 0; i < LIMIT; i += 1) await submitReport();
    const { reportTransactionManager } = await import('./composition');
    const before = (reportTransactionManager as unknown as { reports: ReadonlyMap<number, unknown> })
      .reports.size;

    await submitReport();

    expect(
      (reportTransactionManager as unknown as { reports: ReadonlyMap<number, unknown> }).reports
        .size
    ).toBe(before);
  });

  it('budgets per user, so one citizen cannot exhaust another', async () => {
    // The key is the session user id. Sharing a budget across users would let
    // one account deny service to everyone else.
    await auth.signInAs({ userId: 1, roles: ['citizen'] });
    for (let i = 0; i < LIMIT; i += 1) await submitReport();

    await auth.signInAs({ userId: 2, roles: ['citizen'] });

    expect(await submitReport()).toMatchObject({ ok: true });
  });
});
