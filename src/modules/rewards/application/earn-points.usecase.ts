import { DomainError } from '@/shared/domain/domain-error';
import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError, fromDomainError } from '@/shared/application/app-error';
import type { TransactionManager } from '@/shared/application/ports/transaction-manager';
import { RewardLedger } from '../domain/reward-ledger';
import { createPointTransaction } from '../domain/point-transaction';
import type { RewardLedgerUnitOfWork } from './ports/reward-ledger-unit-of-work.port';

export interface EarnPointsInput {
  readonly userId: number;
  readonly kind: 'earn_report' | 'earn_collect';
  readonly amount: number;
  readonly relatedReportId?: number | null;
  readonly idempotencyKey?: string | null;
}

export interface EarnPointsOutput {
  // false when `idempotencyKey` was already applied — same no-op contract as
  // today's recordPointTransaction.
  readonly applied: boolean;
  readonly balance: number;
}

// Mints points for a report submission or a collector-granted award. Runs
// inside `txManager.run()` so the balance lock, the invariant check, and the
// ledger append are atomic — whether that transaction is freshly opened
// (redeem/save call sites) or an already-open one handed in via
// wrapExistingTx (createReport's single DB transaction).
export async function earnPoints(
  txManager: TransactionManager<RewardLedgerUnitOfWork>,
  input: EarnPointsInput
): Promise<Result<EarnPointsOutput, AppError>> {
  try {
    const output = await txManager.run(async (uow) => {
      const currentBalance = await uow.getBalanceForUpdate(input.userId);
      const ledger = RewardLedger.forBalance(input.userId, currentBalance).applyEarn(input.amount);
      const entry = createPointTransaction({
        userId: input.userId,
        kind: input.kind,
        amount: input.amount,
        relatedReportId: input.relatedReportId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      });
      const applied = await uow.appendTransaction(entry);
      return { applied, balance: applied ? ledger.balance : currentBalance };
    });
    return ok(output);
  } catch (error) {
    if (error instanceof DomainError) return err(fromDomainError(error, 'CONFLICT'));
    return err(appError('UNEXPECTED', 'Failed to record earned points'));
  }
}
