import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import { validateStatusTransition } from '../domain/report';
import type { Report, ReportStatus } from '../domain/report';
import type { ReportRepository } from './ports/report-repository.port';

// Collector-initiated transition — the acting operator claims the task, so
// collectorId is set to the session user (see
// update-report-status.usecase.ts for the reviewer-initiated one, which
// does not touch collectorId).
export async function updateTaskStatus(
  repository: ReportRepository,
  reportId: number,
  newStatus: ReportStatus,
  collectorId: number
): Promise<Result<Report | null, AppError>> {
  try {
    return ok(await repository.updateStatus(reportId, validateStatusTransition(newStatus), { collectorId }));
  } catch {
    return err(appError('UNEXPECTED', 'Failed to update task status'));
  }
}
