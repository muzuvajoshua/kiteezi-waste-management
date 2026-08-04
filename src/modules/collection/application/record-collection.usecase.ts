import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { CollectedWaste } from '../domain/collected-waste';
import type { CollectedWasteRepository, RecordCollectionInput } from './ports/collected-waste-repository.port';

// Satisfies KWM-020: a single function replacing the two near-duplicate
// inserts (createCollectedWaste/saveCollectedWaste) that only ever differed
// in status. presentation/collection.actions.ts keeps both legacy names as
// thin wrappers calling this with 'collected'/'verified' respectively.
export async function recordCollection(
  repository: CollectedWasteRepository,
  input: RecordCollectionInput
): Promise<Result<CollectedWaste, AppError>> {
  try {
    return ok(await repository.record(input));
  } catch {
    return err(appError('UNEXPECTED', 'Failed to record collection'));
  }
}
