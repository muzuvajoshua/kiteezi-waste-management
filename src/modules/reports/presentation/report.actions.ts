"use server";

import { requireUser, requireRole } from '@/modules/auth/presentation/auth-guards';
import { validate } from '@/lib/validation';
import { actionResult } from '@/shared/presentation/action-result';
import { enforceRateLimit, RATE_LIMITS } from '@/shared/presentation/rate-limit';
import { rateLimiter } from '@/shared/presentation/composition';
import type { Result } from '@/shared/application/result';
import type { AppError } from '@/shared/application/app-error';
import type { Role } from '@/utils/db/schema';
import { reportRepository, reportTransactionManager } from './composition';
import { notificationRepository } from '@/modules/notifications/presentation/composition';
import { createReport as createReportUseCase } from '../application/create-report.usecase';
import { listMyReports } from '../application/list-my-reports.usecase';
import { listPendingReports } from '../application/list-pending-reports.usecase';
import { updateReportStatus as updateReportStatusUseCase } from '../application/update-report-status.usecase';
import { updateTaskStatus as updateTaskStatusUseCase } from '../application/update-task-status.usecase';
import { listRecentReports } from '../application/list-recent-reports.usecase';
import { listCollectionTasks } from '../application/list-collection-tasks.usecase';
import type { Report, ReportStatus, WasteType } from '../domain/report';
import type { CollectionTaskSummary } from '../application/list-collection-tasks.usecase';
import {
  createReportSchema,
  updateReportStatusSchema,
  updateTaskStatusSchema,
  recentReportsSchema,
  wasteCollectionTasksSchema,
} from './report.schemas';

// KWM-009/019 — thin Presentation adapter. Every action follows the same
// shape: `actionResult(...)` wrapping guard -> validate -> use-case, returning
// `Result<T, AppError>` and never throwing.
//
// KWM-019 replaced the previous per-action mix of `null`, `[]` and thrown
// errors. That inconsistency was preserved deliberately through the Clean
// Architecture refactor to keep it caller-invisible; with the refactor done,
// it is just debt. Two of the old shapes were actively misleading — `[]` for a
// failed query reads as "no results", and `null` from createReport could not
// say whether validation, authorization or the database failed.

const COLLECTION_ROLES: Role[] = ['operator', 'supervisor', 'admin'];
const REVIEW_ROLES: Role[] = ['supervisor', 'admin'];
const OPS_VIEW_ROLES: Role[] = ['operator', 'supervisor', 'admin'];

// --- Self-service: the actor is the session user ----------------------------

export async function createReport(
  location: string,
  wasteType: WasteType,
  amount: string,
  imageUrl?: string
): Promise<Result<Report, AppError>> {
  return actionResult(async () => {
    const me = await requireUser();
    await enforceRateLimit(rateLimiter, [
      { scope: 'createReport', id: me.userId, policy: RATE_LIMITS.mutationPerUser },
    ]);
    const input = validate(createReportSchema, { location, wasteType, amount, imageUrl });

    return createReportUseCase(reportTransactionManager, notificationRepository, {
      userId: me.userId,
      location: input.location,
      wasteType: input.wasteType,
      amount: input.amount,
      imageUrl: input.imageUrl,
    });
  });
}

export async function getReportsByUserId(): Promise<Result<Report[], AppError>> {
  return actionResult(async () => {
    const me = await requireUser();
    return listMyReports(reportRepository, me.userId);
  });
}

// --- Operator / collection: requires a collection role; collector = session --

// `Report | null` is honest rather than tidy: the repository resolves null when
// no report carries that id, which is a legitimate "not found" value distinct
// from a failure. A caller checks `result.ok && result.value === null`. Mapping
// that to a NOT_FOUND AppError would be a better API, but it belongs in the
// use-case, not in this adapter — deliberately out of scope for KWM-019.
export async function updateTaskStatus(
  reportId: number,
  newStatus: ReportStatus
): Promise<Result<Report | null, AppError>> {
  return actionResult(async () => {
    // The acting operator claims the task; collector is the session user.
    const me = await requireRole(COLLECTION_ROLES);
    await enforceRateLimit(rateLimiter, [
      { scope: 'updateTaskStatus', id: me.userId, policy: RATE_LIMITS.mutationPerUser },
    ]);
    const input = validate(updateTaskStatusSchema, { reportId, newStatus });
    return updateTaskStatusUseCase(reportRepository, input.reportId, input.newStatus, me.userId);
  });
}

// --- Review / oversight: supervisor or admin --------------------------------

export async function getPendingReports(): Promise<Result<Report[], AppError>> {
  return actionResult(async () => {
    await requireRole(REVIEW_ROLES);
    return listPendingReports(reportRepository);
  });
}

export async function updateReportStatus(
  reportId: number,
  status: ReportStatus
): Promise<Result<Report | null, AppError>> {
  return actionResult(async () => {
    const me = await requireRole(REVIEW_ROLES);
    await enforceRateLimit(rateLimiter, [
      { scope: 'updateReportStatus', id: me.userId, policy: RATE_LIMITS.mutationPerUser },
    ]);
    const input = validate(updateReportStatusSchema, { reportId, status });
    return updateReportStatusUseCase(reportRepository, input.reportId, input.status);
  });
}

// --- Operations views: any collection role ----------------------------------

export async function getRecentReports(limit: number = 10): Promise<Result<Report[], AppError>> {
  return actionResult(async () => {
    await requireRole(OPS_VIEW_ROLES);
    const input = validate(recentReportsSchema, { limit });
    return listRecentReports(reportRepository, input.limit);
  });
}

export async function getWasteCollectionTasks(
  limit: number = 20
): Promise<Result<CollectionTaskSummary[], AppError>> {
  return actionResult(async () => {
    await requireRole(OPS_VIEW_ROLES);
    const input = validate(wasteCollectionTasksSchema, { limit });
    return listCollectionTasks(reportRepository, input.limit);
  });
}
