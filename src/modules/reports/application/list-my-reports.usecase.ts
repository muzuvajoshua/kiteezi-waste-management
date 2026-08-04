import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { Report } from '../domain/report';
import type { ReportRepository } from './ports/report-repository.port';

export async function listMyReports(
  repository: ReportRepository,
  userId: number
): Promise<Result<Report[], AppError>> {
  try {
    return ok(await repository.findByUserId(userId));
  } catch {
    return err(appError('UNEXPECTED', 'Failed to fetch reports'));
  }
}
