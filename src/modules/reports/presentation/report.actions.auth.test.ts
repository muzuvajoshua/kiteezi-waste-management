import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  authHarness,
  expectAdmitted,
  expectRefused,
} from '@/modules/auth/presentation/action-auth.test-support';

// Authorization enforcement at the ACTION boundary.
//
// The guard *policy* is already covered (authorization-policy.test.ts,
// require-role.usecase.test.ts). What was untested — and what this file
// exists for — is whether each exported action actually CALLS a guard, with
// the right roles, and lets the rejection propagate. Deleting
// `await requireRole(REVIEW_ROLES)` from getPendingReports would have leaked
// every pending report to any signed-in citizen while the suite stayed green.
//
// Only the composition roots are substituted (that is what composition roots
// are for) so the real auth-guards, real require-* use-cases and real domain
// authorization policy all execute. Nothing about the guard chain is mocked.

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

/**
 * Every exported action, paired with a zero-argument invocation and the roles
 * that may call it. `allowed: null` means "any authenticated user".
 *
 * Driving the unauthenticated and wrong-role cases from one table is
 * deliberate: a new action added to report.actions.ts without a row here is
 * visible as an omission, and no action can quietly skip the shared checks.
 */
const ACTIONS = [
  { name: 'createReport', allowed: null, call: (m: Actions) => m.createReport('Kiteezi', 'plastic', '2kg') },
  { name: 'getReportsByUserId', allowed: null, call: (m: Actions) => m.getReportsByUserId() },
  { name: 'updateTaskStatus', allowed: ['operator', 'supervisor', 'admin'], call: (m: Actions) => m.updateTaskStatus(1, 'collected') },
  { name: 'getPendingReports', allowed: ['supervisor', 'admin'], call: (m: Actions) => m.getPendingReports() },
  { name: 'updateReportStatus', allowed: ['supervisor', 'admin'], call: (m: Actions) => m.updateReportStatus(1, 'approved') },
  { name: 'getRecentReports', allowed: ['operator', 'supervisor', 'admin'], call: (m: Actions) => m.getRecentReports() },
  { name: 'getWasteCollectionTasks', allowed: ['operator', 'supervisor', 'admin'], call: (m: Actions) => m.getWasteCollectionTasks() },
] as const;

type Actions = typeof import('./report.actions');

const ALL_ROLES = ['citizen', 'operator', 'supervisor', 'admin', 'dump_op'] as const;

async function actions(): Promise<Actions> {
  return import('./report.actions');
}

describe('report.actions authorization', () => {
  describe('every action rejects an unauthenticated caller', () => {
    for (const { name, call } of ACTIONS) {
      it(`${name} throws UnauthenticatedError with no session`, async () => {
        await auth.signOut();
        await expectRefused(call(await actions()), 'UNAUTHENTICATED');
      });
    }
  });

  describe('role-restricted actions reject every role they do not name', () => {
    for (const { name, allowed, call } of ACTIONS) {
      if (allowed === null) continue;
      const denied = ALL_ROLES.filter((role) => !(allowed as readonly string[]).includes(role));

      for (const role of denied) {
        it(`${name} throws ForbiddenError for a ${role}`, async () => {
          await auth.signInAs({ roles: [role] });
          await expectRefused(call(await actions()), 'FORBIDDEN');
        });
      }
    }
  });

  describe('role-restricted actions admit every role they name', () => {
    for (const { name, allowed, call } of ACTIONS) {
      if (allowed === null) continue;

      for (const role of allowed) {
        it(`${name} admits a ${role}`, async () => {
          await auth.signInAs({ roles: [role] });
          // Must not be an authorization rejection. The call may still fail
          // for data reasons (e.g. report id 1 not seeded) — that is not what
          // this assertion is about, so only auth errors are disqualifying.
          await expectAdmitted(call(await actions()));
        });
      }
    }
  });

  describe('actions open to any authenticated user admit a plain citizen', () => {
    for (const { name, allowed, call } of ACTIONS) {
      if (allowed !== null) continue;

      it(`${name} admits a citizen`, async () => {
        await auth.signInAs({ roles: ['citizen'] });
        await expectAdmitted(call(await actions()));
      });
    }
  });

  // The two ops-view actions and the two review actions carry DIFFERENT role
  // sets. Asserting the boundary between them catches a copy-paste of the
  // wrong constant — the most likely real-world regression, and one a
  // "was requireRole called?" style test would not notice.
  describe('review actions are stricter than ops-view actions', () => {
    it('an operator may list collection tasks but may not review pending reports', async () => {
      await auth.signInAs({ roles: ['operator'] });
      const mod = await actions();

      await expectAdmitted(mod.getWasteCollectionTasks());
      await expectRefused(mod.getPendingReports(), 'FORBIDDEN');
    });

    it('a supervisor may do both', async () => {
      await auth.signInAs({ roles: ['supervisor'] });
      const mod = await actions();

      await expectAdmitted(mod.getWasteCollectionTasks());
      await expectAdmitted(mod.getPendingReports());
    });
  });

  describe('identity is taken from the session, never from an argument', () => {
    it('getReportsByUserId returns only the session user\'s reports', async () => {
      await auth.signInAs({ userId: 7, roles: ['citizen'] });
      const { reportRepository } = await import('./composition');
      const repo = reportRepository as unknown as {
        seed(r: Record<string, unknown>): void;
      };
      const base = {
        location: 'Kiteezi',
        wasteType: 'plastic',
        amount: '1kg',
        imageUrl: null,
        verificationResult: null,
        status: 'pending',
        createdAt: new Date(),
        collectorId: null,
      };
      repo.seed({ ...base, id: 1, userId: 7 });
      repo.seed({ ...base, id: 2, userId: 8 });

      const mine = await (await actions()).getReportsByUserId();

      expect(mine.ok).toBe(true);
      if (!mine.ok) return;
      expect(mine.value.map((r) => r.id)).toEqual([1]);
    });
  });
});
