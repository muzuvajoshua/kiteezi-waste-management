"use server";

import { requireUser, requireRole } from '@/modules/auth/presentation/auth-guards';
import { validate } from '@/lib/validation';
import { actionResult } from '@/shared/presentation/action-result';
import { type Result, ok } from '@/shared/application/result';
import type { AppError } from '@/shared/application/app-error';
import type { Role } from '@/utils/db/schema';
import { rewardRepository, rewardCatalogRepository, rewardTransactionManager } from './composition';
import { getBalance } from '../application/get-balance.usecase';
import { listTransactions } from '../application/list-transactions.usecase';
import { getAvailableRewards as getAvailableRewardsUseCase } from '../application/get-available-rewards.usecase';
import { redeemReward as redeemRewardUseCase } from '../application/redeem-reward.usecase';
import { earnPoints } from '../application/earn-points.usecase';
import { getAllBalances } from '../application/get-all-balances.usecase';
import type {
  PointTransactionPage,
  RewardBalanceRow,
} from '../application/ports/reward-repository.port';
import type { AvailableRewardsOutput } from '../application/get-available-rewards.usecase';
import { redeemRewardSchema, saveRewardSchema, rewardTransactionsQuerySchema } from './reward.schemas';

// KWM-009/011/012/018/019 — thin Presentation adapter: auth guard, then Zod
// validation, then a use-case call through the module's composition root, all
// inside `actionResult` so every action returns `Result<T, AppError>` and never
// throws. See report.actions.ts for why the previous null/[]/throw mix went.

const COLLECTION_ROLES: Role[] = ['operator', 'supervisor', 'admin'];
const REVIEW_ROLES: Role[] = ['supervisor', 'admin'];

export async function getUserBalance(): Promise<Result<number, AppError>> {
  return actionResult(async () => {
    const me = await requireUser();
    return getBalance(rewardRepository, me.userId);
  });
}

export async function getRewardTransactions(
  limit: number = 20,
  cursor?: { createdAt: Date | string; id: number }
): Promise<Result<PointTransactionPage, AppError>> {
  return actionResult(async () => {
    const me = await requireUser();
    const input = validate(rewardTransactionsQuerySchema, { limit, cursor });
    return listTransactions(rewardRepository, {
      userId: me.userId,
      limit: input.limit,
      cursor: input.cursor,
    });
  });
}

export async function getAvailableRewards(): Promise<Result<AvailableRewardsOutput, AppError>> {
  return actionResult(async () => {
    const me = await requireUser();
    return getAvailableRewardsUseCase(rewardRepository, rewardCatalogRepository, me.userId);
  });
}

export async function redeemReward(rewardId: number): Promise<Result<{ balance: number }, AppError>> {
  return actionResult(async () => {
    const me = await requireUser();
    const { rewardId: id } = validate(redeemRewardSchema, { rewardId });
    return redeemRewardUseCase(rewardTransactionManager, rewardCatalogRepository, {
      userId: me.userId,
      rewardId: id,
    });
  });
}

// saveReward awards points to a *recipient* (a reporter) — actor is an authorised
// operator/admin from the session. NOT idempotent without a caller-supplied
// stable key (deterministic dedup deferred to KWM-031).
export async function saveReward(
  recipientUserId: number,
  amount: number,
  idempotencyKey?: string
): Promise<Result<{ applied: boolean }, AppError>> {
  return actionResult(async () => {
    await requireRole(COLLECTION_ROLES);
    const input = validate(saveRewardSchema, { recipientUserId, amount, idempotencyKey });
    const result = await earnPoints(rewardTransactionManager, {
      userId: input.recipientUserId,
      kind: 'earn_collect',
      amount: input.amount,
      idempotencyKey: input.idempotencyKey ?? null,
    });
    // Narrow the use-case's output to the caller-facing shape: whether the
    // mint was applied. The recipient's resulting balance is deliberately not
    // returned — the actor here is a collector, not the balance's owner.
    return result.ok ? ok({ applied: result.value.applied }) : result;
  });
}

export async function getAllRewards(): Promise<Result<readonly RewardBalanceRow[], AppError>> {
  return actionResult(async () => {
    await requireRole(REVIEW_ROLES);
    return getAllBalances(rewardRepository);
  });
}
