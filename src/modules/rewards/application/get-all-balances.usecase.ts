import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { RewardRepository, RewardBalanceRow } from './ports/reward-repository.port';

// Admin/supervisor "all balances" view — see the RewardBalanceRow doc
// comment on the port for why this crosses into a Users join.
export async function getAllBalances(
  repository: RewardRepository
): Promise<Result<readonly RewardBalanceRow[], AppError>> {
  try {
    return ok(await repository.getAllBalances());
  } catch {
    return err(appError('UNEXPECTED', 'Failed to fetch reward balances'));
  }
}
