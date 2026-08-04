import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { Report } from '../domain/report';
import type { ReportRepository } from './ports/report-repository.port';

export async function listPendingReports(repository: ReportRepository): Promise<Result<Report[], AppError>> {
  try {
    return ok(await repository.findPending());
  } catch {
    return err(appError('UNEXPECTED', 'Failed to fetch pending reports'));
  }
}
