import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { TransactionManager } from '@/shared/application/ports/transaction-manager';
import { earnPoints } from '@/modules/rewards/application/earn-points.usecase';
import { createNotification } from '@/modules/notifications/application/create-notification.usecase';
import type { NotificationRepository } from '@/modules/notifications/application/ports/notification-repository.port';
import type { Report } from '../domain/report';
import type { ReportWriteUnitOfWork, CreateReportInput } from './ports/report-write-unit-of-work.port';

// Cross-module Application imports (rewards' earnPoints, notifications'
// createNotification) — the same pattern createReport already used before
// this module existed (calling earnPoints via wrapExistingTx directly from
// legacy utils/db/actions.ts), now properly behind this module's own ports.
export async function createReport(
  txManager: TransactionManager<ReportWriteUnitOfWork>,
  notificationRepository: NotificationRepository,
  input: CreateReportInput
): Promise<Result<Report, AppError>> {
  let report: Report;
  try {
    report = await txManager.run(async (uow) => {
      const created = await uow.insert(input);

      // Exactly one +10 per report row. Checked/re-thrown, not swallowed:
      // a failed mint must roll back the report insert too, matching
      // today's single txdb.transaction — see the rewards module's
      // wrapExistingTx docs for why a swallowed Result would silently
      // break this atomicity.
      const earnResult = await earnPoints(uow.rewardLedgerTxManager, {
        userId: input.userId,
        kind: 'earn_report',
        amount: 10,
        relatedReportId: created.id,
        idempotencyKey: `report:${created.id}:earn`,
      });
      if (!earnResult.ok) {
        throw new Error(earnResult.error.message);
      }

      return created;
    });
  } catch {
    return err(appError('UNEXPECTED', 'Failed to create report'));
  }

  // Best-effort and non-critical: a notification failure must not roll
  // back the already-committed report.
  const notifyResult = await createNotification(
    notificationRepository,
    input.userId,
    "You've earned 10 points for reporting waste!",
    'reward'
  );
  if (!notifyResult.ok) {
    console.error('Failed to send report notification:', notifyResult.error.message);
  }

  return ok(report);
}
