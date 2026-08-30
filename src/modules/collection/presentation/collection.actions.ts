"use server";

import { requireRole } from '@/modules/auth/presentation/auth-guards';
import { validate } from '@/lib/validation';
import { actionResult } from '@/shared/presentation/action-result';
import { enforceRateLimit, RATE_LIMITS } from '@/shared/presentation/rate-limit';
import { rateLimiter } from '@/shared/presentation/composition';
import type { Result } from '@/shared/application/result';
import type { AppError } from '@/shared/application/app-error';
import type { Role } from '@/utils/db/schema';
import { collectedWasteRepository } from './composition';
import { listMyCollectedWastes } from '../application/list-my-collected-wastes.usecase';
import { recordCollection } from '../application/record-collection.usecase';
import type { CollectedWaste } from '../domain/collected-waste';
import { collectedWasteSchema } from './collection.schemas';

// KWM-009/019/020 — thin Presentation adapter. Both write actions wrap the
// single `recordCollection` use-case (KWM-020) with a different `status`, and
// every action returns `Result<T, AppError>` via `actionResult` (KWM-019).
//
// The pre-KWM-019 swallow-vs-rethrow split between createCollectedWaste
// (returned null) and saveCollectedWaste (threw) is gone: both now report the
// same way, which is the point of the issue. The two names survive because
// they encode different statuses, not different error handling.

const COLLECTION_ROLES: Role[] = ['operator', 'supervisor', 'admin'];

export async function getCollectedWastesByCollector(): Promise<
  Result<CollectedWaste[], AppError>
> {
  return actionResult(async () => {
    const me = await requireRole(COLLECTION_ROLES);
    return listMyCollectedWastes(collectedWasteRepository, me.userId);
  });
}

export async function createCollectedWaste(
  reportId: number
): Promise<Result<CollectedWaste, AppError>> {
  return actionResult(async () => {
    const me = await requireRole(COLLECTION_ROLES);
    await enforceRateLimit(rateLimiter, [
      { scope: 'createCollectedWaste', id: me.userId, policy: RATE_LIMITS.mutationPerUser },
    ]);
    const { reportId: id } = validate(collectedWasteSchema, { reportId });
    return recordCollection(collectedWasteRepository, {
      reportId: id,
      collectorId: me.userId,
      status: 'collected',
    });
  });
}

export async function saveCollectedWaste(
  reportId: number
): Promise<Result<CollectedWaste, AppError>> {
  return actionResult(async () => {
    const me = await requireRole(COLLECTION_ROLES);
    await enforceRateLimit(rateLimiter, [
      { scope: 'saveCollectedWaste', id: me.userId, policy: RATE_LIMITS.mutationPerUser },
    ]);
    const { reportId: id } = validate(collectedWasteSchema, { reportId });
    return recordCollection(collectedWasteRepository, {
      reportId: id,
      collectorId: me.userId,
      status: 'verified',
    });
  });
}
