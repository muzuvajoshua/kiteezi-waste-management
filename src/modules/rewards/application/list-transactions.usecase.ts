import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type {
  RewardRepository,
  PointTransactionCursor,
  PointTransactionPage,
} from './ports/reward-repository.port';

export interface ListTransactionsInput {
  readonly userId: number;
  readonly limit: number;
  readonly cursor?: PointTransactionCursor;
}

// Paginated activity list (keyset on (created_at, id) DESC) — NOT a balance
// source; see get-balance.usecase.ts for that.
export async function listTransactions(
  repository: RewardRepository,
  input: ListTransactionsInput
): Promise<Result<PointTransactionPage, AppError>> {
  try {
    const page = await repository.getTransactions(input.userId, { limit: input.limit, cursor: input.cursor });
    return ok(page);
  } catch {
    return err(appError('UNEXPECTED', 'Failed to fetch reward transactions'));
  }
}
