"use server";

import { requireUser, requireRole } from '@/modules/auth/presentation/auth-guards';
import { validate } from '@/lib/validation';
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
import type { ReportStatus, WasteType } from '../domain/report';
import {
  createReportSchema,
  updateReportStatusSchema,
  updateTaskStatusSchema,
  recentReportsSchema,
  wasteCollectionTasksSchema,
} from './report.schemas';

// KWM-009 — thin Presentation adapter: same exported names/return shapes as
// the legacy utils/db/actions.ts report exports (no caller-visible
// behavior change), including the swallow-vs-rethrow inconsistency between
// updateTaskStatus (rethrows) and everything else (swallows to a default)
// — preserved deliberately, not normalized away.

const COLLECTION_ROLES: Role[] = ['operator', 'supervisor', 'admin'];
const REVIEW_ROLES: Role[] = ['supervisor', 'admin'];
const OPS_VIEW_ROLES: Role[] = ['operator', 'supervisor', 'admin'];

// --- Self-service: the actor is the session user ----------------------------

export async function createReport(
  location: string,
  wasteType: WasteType,
  amount: string,
  imageUrl?: string
) {
  const me = await requireUser();
  const input = validate(createReportSchema, { location, wasteType, amount, imageUrl });

  const result = await createReportUseCase(reportTransactionManager, notificationRepository, {
    userId: me.userId,
    location: input.location,
    wasteType: input.wasteType,
    amount: input.amount,
    imageUrl: input.imageUrl,
  });
  if (!result.ok) {
    console.error('Error creating report:', result.error.message);
    return null;
  }
  return result.value;
}

export async function getReportsByUserId() {
  const me = await requireUser();
  const result = await listMyReports(reportRepository, me.userId);
  if (!result.ok) {
    console.error('Error fetching reports:', result.error.message);
    return [];
  }
  return result.value;
}

// --- Operator / collection: requires a collection role; collector = session --

export async function updateTaskStatus(reportId: number, newStatus: ReportStatus) {
  // The acting operator claims the task; collector is the session user.
  const me = await requireRole(COLLECTION_ROLES);
  const input = validate(updateTaskStatusSchema, { reportId, newStatus });
  const result = await updateTaskStatusUseCase(reportRepository, input.reportId, input.newStatus, me.userId);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

// --- Review / oversight: supervisor or admin --------------------------------

export async function getPendingReports() {
  await requireRole(REVIEW_ROLES);
  const result = await listPendingReports(reportRepository);
  if (!result.ok) {
    console.error('Error fetching pending reports:', result.error.message);
    return [];
  }
  return result.value;
}

export async function updateReportStatus(reportId: number, status: ReportStatus) {
  await requireRole(REVIEW_ROLES);
  const input = validate(updateReportStatusSchema, { reportId, status });
  const result = await updateReportStatusUseCase(reportRepository, input.reportId, input.status);
  if (!result.ok) {
    console.error('Error updating report status:', result.error.message);
    return null;
  }
  return result.value;
}

// --- Operations views: any collection role ----------------------------------

export async function getRecentReports(limit: number = 10) {
  await requireRole(OPS_VIEW_ROLES);
  const input = validate(recentReportsSchema, { limit });
  const result = await listRecentReports(reportRepository, input.limit);
  if (!result.ok) {
    console.error('Error fetching recent reports:', result.error.message);
    return [];
  }
  return result.value;
}

export async function getWasteCollectionTasks(limit: number = 20) {
  await requireRole(OPS_VIEW_ROLES);
  const input = validate(wasteCollectionTasksSchema, { limit });
  const result = await listCollectionTasks(reportRepository, input.limit);
  if (!result.ok) {
    console.error('Error fetching waste collection tasks:', result.error.message);
    return [];
  }
  return result.value;
}
