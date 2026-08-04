import { DomainError } from '@/shared/domain/domain-error';
import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError, fromDomainError } from '@/shared/application/app-error';
import type { TransactionManager } from '@/shared/application/ports/transaction-manager';
import { RewardLedger } from '../domain/reward-ledger';
import { createPointTransaction } from '../domain/point-transaction';
import { RewardUnavailableError } from '../domain/errors';
import type { RewardLedgerUnitOfWork } from './ports/reward-ledger-unit-of-work.port';
import type { RewardCatalogRepository } from './ports/reward-catalog-repository.port';

export interface RedeemRewardInput {
  readonly userId: number;
  // 0 means "redeem the entire balance" — same convention as today's action.
  readonly rewardId: number;
}

export interface RedeemRewardOutput {
  readonly balance: number;
}

// The catalog item is looked up before opening the ledger transaction (the
// Drizzle adapter reads it via the plain http client, not `tx` — reward
// availability changes rarely, so this narrows, but does not remove, the
// window an admin's availability toggle could race a redemption; the
// balance invariant itself stays fully protected by the transactional lock
// below). A missing item is treated the same as an unavailable one, so a
// bad id doesn't let a client distinguish "doesn't exist" from "disabled".
export async function redeemReward(
  txManager: TransactionManager<RewardLedgerUnitOfWork>,
  catalogRepository: RewardCatalogRepository,
  input: RedeemRewardInput
): Promise<Result<RedeemRewardOutput, AppError>> {
  try {
    let costPoints: number | null = null;
    let relatedRedemptionId: number | null = null;

    if (input.rewardId !== 0) {
      const item = await catalogRepository.findById(input.rewardId);
      if (!item) throw new RewardUnavailableError();
      item.assertRedeemable();
      costPoints = item.costPoints;
      relatedRedemptionId = item.id;
    }

    const balance = await txManager.run(async (uow) => {
      const currentBalance = await uow.getBalanceForUpdate(input.userId);

      if (costPoints === null) {
        // Redeem-all: no-op when there is nothing to redeem.
        if (currentBalance <= 0) return 0;
        const ledger = RewardLedger.forBalance(input.userId, currentBalance).applyRedeem(currentBalance);
        await uow.appendTransaction(
          createPointTransaction({ userId: input.userId, kind: 'redeem', amount: -currentBalance })
        );
        return ledger.balance;
      }

      const ledger = RewardLedger.forBalance(input.userId, currentBalance).applyRedeem(costPoints);
      await uow.appendTransaction(
        createPointTransaction({
          userId: input.userId,
          kind: 'redeem',
          amount: -costPoints,
          relatedRedemptionId,
        })
      );
      return ledger.balance;
    });

    return ok({ balance });
  } catch (error) {
    if (error instanceof DomainError) return err(fromDomainError(error, 'CONFLICT'));
    return err(appError('UNEXPECTED', 'Failed to redeem reward'));
  }
}
