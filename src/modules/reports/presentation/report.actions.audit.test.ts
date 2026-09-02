import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authHarness } from '@/modules/auth/presentation/action-auth.test-support';
import type { InMemoryAuditLogger } from '@/shared/infrastructure/audit/in-memory-audit-logger.adapter';

// KWM-078 — privileged report mutations must leave an audit trail.
//
// Pins the WIRING, not the logger. The logger has its own contract; deleting
// the `auditLogger.record(...)` call from an action leaves every other test
// green, which is the same gap the authorization and rate-limit suites exist
// to close.

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

async function auditLog(): Promise<InMemoryAuditLogger> {
  const shared = (await import('@/shared/presentation/composition')) as unknown as {
    auditLogger: InMemoryAuditLogger;
  };
  return shared.auditLogger;
}

async function seedReport(id: number, status = 'pending') {
  const { reportRepository } = await import('./composition');
  (reportRepository as unknown as { seed(r: Record<string, unknown>): void }).seed({
    id,
    userId: 1,
    location: 'Kiteezi',
    wasteType: 'plastic',
    amount: '2',
    imageUrl: null,
    verificationResult: null,
    status,
    createdAt: new Date(),
    collectorId: null,
  });
}

beforeEach(async () => {
  await auth.reset();
  (await auditLog()).clear();
});

describe('report action auditing', () => {
  describe('updateReportStatus', () => {
    it('records who changed the status and to what', async () => {
      await auth.signInAs({ userId: 42, roles: ['supervisor'] });
      await seedReport(9);

      await (await import('./report.actions')).updateReportStatus(9, 'approved');

      expect((await auditLog()).find('report.status.updated')).toMatchObject({
        actorUserId: 42,
        target: 'report:9',
        after: { status: 'approved' },
      });
    });

    it('attributes the entry to the SESSION user, not an argument', async () => {
      // An audit trail that can be told who the actor was is worthless.
      await auth.signInAs({ userId: 99, roles: ['admin'] });
      await seedReport(9);

      await (await import('./report.actions')).updateReportStatus(9, 'rejected');

      expect((await auditLog()).find('report.status.updated')?.actorUserId).toBe(99);
    });

    it('records nothing when the caller is refused', async () => {
      // A refused attempt is not a mutation. Logging it here would fill the
      // trail with noise; failed authorization is a separate concern.
      await auth.signInAs({ userId: 42, roles: ['citizen'] });
      await seedReport(9);

      await (await import('./report.actions')).updateReportStatus(9, 'approved');

      expect((await auditLog()).entries).toHaveLength(0);
    });

    it('records nothing when the report does not exist, and still succeeds', async () => {
      // Both halves matter. Asserting only "no entry" passes even if the
      // guard is removed, because building the entry from a null report
      // throws and the throw prevents the write — the right outcome for the
      // wrong reason. Asserting the action still returns ok(null) pins the
      // guard itself. Found by mutation.
      await auth.signInAs({ userId: 42, roles: ['supervisor'] });

      const result = await (await import('./report.actions')).updateReportStatus(404, 'approved');

      expect(result).toEqual({ ok: true, value: null });
      expect((await auditLog()).entries).toHaveLength(0);
    });
  });

  describe('updateTaskStatus', () => {
    it('records the operator who claimed the task', async () => {
      await auth.signInAs({ userId: 8, roles: ['operator'] });
      await seedReport(11);

      await (await import('./report.actions')).updateTaskStatus(11, 'collected');

      expect((await auditLog()).find('report.task.updated')).toMatchObject({
        actorUserId: 8,
        target: 'report:11',
        after: { status: 'collected', collectorId: 8 },
      });
    });
  });

  // KWM-032 — bulk review writes one entry per report that changed, not one
  // for the batch. "What happened to report 9, and who decided it" is the
  // question the trail exists to answer.
  describe('reviewReports', () => {
    it('records an entry per report reviewed', async () => {
      await auth.signInAs({ userId: 42, roles: ['supervisor'] });
      await seedReport(9);
      await seedReport(10);

      await (await import('./report.actions')).reviewReports([9, 10], 'approved');

      const entries = (await auditLog()).entries.filter((e) => e.action === 'report.reviewed');
      expect(entries.map((e) => e.target)).toEqual(['report:9', 'report:10']);
    });

    it('records the rejection reason, which is what the citizen is shown', async () => {
      await auth.signInAs({ userId: 42, roles: ['supervisor'] });
      await seedReport(9);

      await (await import('./report.actions')).reviewReports([9], 'rejected', 'Photo is unclear');

      expect((await auditLog()).find('report.reviewed')).toMatchObject({
        actorUserId: 42,
        target: 'report:9',
        after: { status: 'rejected', reviewReason: 'Photo is unclear' },
      });
    });

    it('records nothing for reports another supervisor had already decided', async () => {
      // Nothing happened to them here, so an entry would misreport the batch.
      await auth.signInAs({ userId: 42, roles: ['supervisor'] });
      await seedReport(9);
      await seedReport(10, 'approved');

      await (await import('./report.actions')).reviewReports([9, 10], 'rejected', 'Duplicate');

      const entries = (await auditLog()).entries.filter((e) => e.action === 'report.reviewed');
      expect(entries.map((e) => e.target)).toEqual(['report:9']);
    });

    it('records nothing when a citizen is refused', async () => {
      await auth.signInAs({ userId: 3, roles: ['citizen'] });
      await seedReport(9);

      await (await import('./report.actions')).reviewReports([9], 'approved');

      expect((await auditLog()).entries).toHaveLength(0);
    });

    it('records nothing when the request is rejected for having no reason', async () => {
      // Validation fails before any write, so there is nothing to record.
      await auth.signInAs({ userId: 42, roles: ['supervisor'] });
      await seedReport(9);

      await (await import('./report.actions')).reviewReports([9], 'rejected');

      expect((await auditLog()).entries).toHaveLength(0);
    });
  });

  describe('a failing audit write', () => {
    it('does not fail the action it was recording', async () => {
      // Fail-open, deliberately: a status change should not be refused
      // because the audit table is unavailable.
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await auth.signInAs({ userId: 42, roles: ['supervisor'] });
      await seedReport(9);
      (await auditLog()).failWith(new Error('audit table unavailable'));

      const result = await (await import('./report.actions')).updateReportStatus(9, 'approved');

      expect(result).toMatchObject({ ok: true });
    });

    it('is logged server-side rather than swallowed silently', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await auth.signInAs({ userId: 42, roles: ['supervisor'] });
      await seedReport(9);
      (await auditLog()).failWith(new Error('audit table unavailable'));

      await (await import('./report.actions')).updateReportStatus(9, 'approved');

      expect(spy).toHaveBeenCalled();
    });
  });
});
