import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { ReportStatus, WasteType } from '../domain/report';
import type { ReportRepository } from './ports/report-repository.port';

export interface CollectionTaskSummary {
  readonly id: number;
  readonly location: string;
  readonly wasteType: WasteType;
  readonly amount: string;
  readonly status: ReportStatus;
  readonly date: string; // YYYY-MM-DD
  readonly collectorId: number | null;
}

export async function listCollectionTasks(
  repository: ReportRepository,
  limit: number
): Promise<Result<CollectionTaskSummary[], AppError>> {
  try {
    const rows = await repository.findCollectionTasks(limit);
    return ok(rows.map((row) => ({ ...row, date: row.date.toISOString().split('T')[0] })));
  } catch {
    return err(appError('UNEXPECTED', 'Failed to fetch waste collection tasks'));
  }
}
