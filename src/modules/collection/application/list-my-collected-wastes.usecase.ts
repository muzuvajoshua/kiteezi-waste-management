import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { CollectedWaste } from '../domain/collected-waste';
import type { CollectedWasteRepository } from './ports/collected-waste-repository.port';

export async function listMyCollectedWastes(
  repository: CollectedWasteRepository,
  collectorId: number
): Promise<Result<CollectedWaste[], AppError>> {
  try {
    return ok(await repository.findByCollectorId(collectorId));
  } catch {
    return err(appError('UNEXPECTED', 'Failed to fetch collected wastes'));
  }
}
