import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { RewardRepository } from './ports/reward-repository.port';
import type { RewardCatalogRepository } from './ports/reward-catalog-repository.port';

export interface RewardCatalogItemSummary {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly costPoints: number;
}

export interface AvailableRewardsOutput {
  readonly balance: number;
  readonly items: readonly RewardCatalogItemSummary[];
}

// Mapped to a plain summary (not the RewardCatalogItem domain object)
// because this crosses the Result boundary — same reasoning as AppError
// staying plain data (see shared/application/app-error.ts).
export async function getAvailableRewards(
  rewardRepository: RewardRepository,
  catalogRepository: RewardCatalogRepository,
  userId: number
): Promise<Result<AvailableRewardsOutput, AppError>> {
  try {
    const [balance, items] = await Promise.all([
      rewardRepository.getBalance(userId),
      catalogRepository.findAvailable(),
    ]);
    return ok({
      balance,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        costPoints: item.costPoints,
      })),
    });
  } catch {
    return err(appError('UNEXPECTED', 'Failed to fetch available rewards'));
  }
}
