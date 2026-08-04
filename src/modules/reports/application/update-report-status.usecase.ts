import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import { validateStatusTransition } from '../domain/report';
import type { Report, ReportStatus } from '../domain/report';
import type { ReportRepository } from './ports/report-repository.port';

// Reviewer-initiated transition (no collectorId) — see
// update-task-status.usecase.ts for the collector-initiated one. Both
// route through validateStatusTransition, the single enforcement point.
export async function updateReportStatus(
  repository: ReportRepository,
  reportId: number,
  status: ReportStatus
): Promise<Result<Report | null, AppError>> {
  try {
    return ok(await repository.updateStatus(reportId, validateStatusTransition(status)));
  } catch {
    return err(appError('UNEXPECTED', 'Failed to update report status'));
  }
}
