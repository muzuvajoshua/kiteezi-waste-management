"use server";

import { requireUser, requireRole } from '@/modules/auth/presentation/auth-guards';
import { validate } from '@/lib/validation';
import type { Role } from '@/utils/db/schema';
import { rewardRepository, rewardCatalogRepository, rewardTransactionManager } from './composition';
import { getBalance } from '../application/get-balance.usecase';
import { listTransactions } from '../application/list-transactions.usecase';
import { getAvailableRewards as getAvailableRewardsUseCase } from '../application/get-available-rewards.usecase';
import { redeemReward as redeemRewardUseCase } from '../application/redeem-reward.usecase';
import { earnPoints } from '../application/earn-points.usecase';
import { getAllBalances } from '../application/get-all-balances.usecase';
import { redeemRewardSchema, saveRewardSchema, rewardTransactionsQuerySchema } from './reward.schemas';

// KWM-009/011/012/018 — thin Presentation adapter: same exported names and
// return shapes as the legacy utils/db/actions.ts reward exports (no
// caller-visible behavior change). Auth guard first, then Zod validation,
// then a use-case call through the module's composition root, then unwrap
// Result back to the plain value/shape callers already expect.

const COLLECTION_ROLES: Role[] = ['operator', 'supervisor', 'admin'];
const REVIEW_ROLES: Role[] = ['supervisor', 'admin'];

export async function getUserBalance(): Promise<number> {
  const me = await requireUser();
  const result = await getBalance(rewardRepository, me.userId);
  if (!result.ok) {
    console.error('Error fetching reward balance:', result.error.message);
    return 0;
  }
  return result.value;
}

export async function getRewardTransactions(
  limit: number = 20,
  cursor?: { createdAt: Date | string; id: number }
) {
  const me = await requireUser();
  const input = validate(rewardTransactionsQuerySchema, { limit, cursor });
  const result = await listTransactions(rewardRepository, {
    userId: me.userId,
    limit: input.limit,
    cursor: input.cursor,
  });
  if (!result.ok) {
    console.error('Error fetching reward transactions:', result.error.message);
    return { items: [], nextCursor: null };
  }
  return result.value;
}

export async function getAvailableRewards() {
  const me = await requireUser();
  const result = await getAvailableRewardsUseCase(rewardRepository, rewardCatalogRepository, me.userId);
  if (!result.ok) {
    console.error('Error fetching available rewards:', result.error.message);
    return { balance: 0, items: [] };
  }
  return result.value;
}

export async function redeemReward(rewardId: number) {
  const me = await requireUser();
  const { rewardId: id } = validate(redeemRewardSchema, { rewardId });
  const result = await redeemRewardUseCase(rewardTransactionManager, rewardCatalogRepository, {
    userId: me.userId,
    rewardId: id,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

// saveReward awards points to a *recipient* (a reporter) — actor is an authorised
// operator/admin from the session. NOT idempotent without a caller-supplied
// stable key (deterministic dedup deferred to KWM-031).
export async function saveReward(recipientUserId: number, amount: number, idempotencyKey?: string) {
  await requireRole(COLLECTION_ROLES);
  const input = validate(saveRewardSchema, { recipientUserId, amount, idempotencyKey });
  const result = await earnPoints(rewardTransactionManager, {
    userId: input.recipientUserId,
    kind: 'earn_collect',
    amount: input.amount,
    idempotencyKey: input.idempotencyKey ?? null,
  });
  if (!result.ok) throw new Error(result.error.message);
  return { applied: result.value.applied };
}

export async function getAllRewards() {
  await requireRole(REVIEW_ROLES);
  const result = await getAllBalances(rewardRepository);
  if (!result.ok) {
    console.error('Error fetching all rewards:', result.error.message);
    return [];
  }
  return result.value;
}
