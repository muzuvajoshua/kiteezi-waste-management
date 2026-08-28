import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { RewardRepository } from './ports/reward-repository.port';

// Reads the materialised balance — no pagination dependency, single source
// of truth (never derived by summing a page of transactions).
export async function getBalance(
  repository: RewardRepository,
  userId: number
): Promise<Result<number, AppError>> {
  try {
    return ok(await repository.getBalance(userId));
  } catch {
    return err(appError('UNEXPECTED', 'Failed to fetch reward balance'));
  }
}
