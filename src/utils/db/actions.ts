"use server";

import { db } from './dbConfig';
import { txdb } from './txClient';
import { Reports, CollectedWastes, Notifications } from './schema';
import type { ReportStatus, WasteType, Role } from './schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireUser, requireRole, requireOwnership } from '@/modules/auth/presentation/auth-guards';
import { createNotification } from './internal';
import { validate } from '@/lib/validation';
import { earnPoints } from '@/modules/rewards/application/earn-points.usecase';
import { wrapExistingTx } from '@/modules/rewards/infrastructure/drizzle-reward-ledger-unit-of-work.adapter';
import {
  createReportSchema,
  updateReportStatusSchema,
  updateTaskStatusSchema,
  recentReportsSchema,
  wasteCollectionTasksSchema,
  collectedWasteSchema,
  markNotificationReadSchema,
} from './schemas';

// KWM-009 — every exported function is a "use server" action (a public RPC
// endpoint). The acting identity is ALWAYS derived from the session; user ids
// only ever appear as operation *targets*. Reward reads/writes now live in
// @/modules/rewards (Phase 1 of the architecture transformation) — this file
// keeps only the point-mint call inside createReport's own transaction,
// since that report/points atomicity is a reports-module concern.

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

  let report;
  try {
    report = await txdb.transaction(async (tx) => {
      const [created] = await tx
        .insert(Reports)
        .values({
          user_id: me.userId,
          location: input.location,
          wasteType: input.wasteType,
          amount: input.amount,
          imageUrl: input.imageUrl,
          // Set server-side (pending) — the AI verdict is never client-trusted (KWM-043).
          verificationResult: null,
          status: "pending",
        })
        .returning();

      // Exactly one +10 per report row. NOTE: this prevents replaying the earn
      // for the SAME report; it does NOT dedupe a duplicate report submission
      // (a resubmit creates a new report) — that needs a client key (KWM-025/041)
      // and/or rate limiting (KWM-054).
      // wrapExistingTx reuses this already-open transaction (not a new one),
      // so the point mint stays atomic with the Reports insert. earnPoints
      // returns a Result rather than throwing on a domain error, so it must
      // be checked and re-thrown here — otherwise a mint failure would be
      // silently swallowed and this transaction would commit the report
      // without ever awarding points.
      const earnResult = await earnPoints(wrapExistingTx(tx), {
        userId: me.userId,
        kind: 'earn_report',
        amount: 10,
        relatedReportId: created.id,
        idempotencyKey: `report:${created.id}:earn`,
      });
      if (!earnResult.ok) {
        throw new Error(earnResult.error.message);
      }

      return created;
    });
  } catch (error) {
    console.error("Error creating report:", error);
    return null;
  }

  // Best-effort and non-critical: a notification failure must not roll back the report.
  await createNotification(me.userId, `You've earned 10 points for reporting waste!`, 'reward');
  return report;
}

export async function getReportsByUserId() {
  const me = await requireUser();
  try {
    return await db.select().from(Reports).where(eq(Reports.user_id, me.userId)).execute();
  } catch (error) {
    console.error("Error fetching reports:", error);
    return [];
  }
}

export async function getUnreadNotifications() {
  const me = await requireUser();
  try {
    return await db.select().from(Notifications).where(
      and(
        eq(Notifications.userId, me.userId),
        eq(Notifications.isRead, false)
      )
    ).execute();
  } catch (error) {
    console.error("Error fetching unread notifications:", error);
    return [];
  }
}

export async function markNotificationAsRead(notificationId: number) {
  // Authenticate before any lookup, then enforce ownership (admins may override).
  await requireUser();
  const { notificationId: id } = validate(markNotificationReadSchema, { notificationId });
  const [notif] = await db
    .select()
    .from(Notifications)
    .where(eq(Notifications.id, id))
    .execute();
  if (!notif) return;
  await requireOwnership(notif.userId, { allowRoles: ['admin'] });
  try {
    await db.update(Notifications).set({ isRead: true }).where(eq(Notifications.id, id)).execute();
  } catch (error) {
    console.error("Error marking notification as read:", error);
  }
}

// --- Operator / collection: requires a collection role; collector = session --

export async function getCollectedWastesByCollector() {
  const me = await requireRole(COLLECTION_ROLES);
  try {
    return await db.select().from(CollectedWastes).where(eq(CollectedWastes.collectorId, me.userId)).execute();
  } catch (error) {
    console.error("Error fetching collected wastes:", error);
    return [];
  }
}

export async function createCollectedWaste(reportId: number) {
  const me = await requireRole(COLLECTION_ROLES);
  const { reportId: id } = validate(collectedWasteSchema, { reportId });
  try {
    const [collectedWaste] = await db
      .insert(CollectedWastes)
      .values({
        reportId: id,
        collectorId: me.userId,
        collectionDate: new Date(),
      })
      .returning()
      .execute();
    return collectedWaste;
  } catch (error) {
    console.error("Error creating collected waste:", error);
    return null;
  }
}

export async function saveCollectedWaste(reportId: number) {
  const me = await requireRole(COLLECTION_ROLES);
  const { reportId: id } = validate(collectedWasteSchema, { reportId });
  try {
    const [collectedWaste] = await db
      .insert(CollectedWastes)
      .values({
        reportId: id,
        collectorId: me.userId,
        collectionDate: new Date(),
        status: 'verified',
      })
      .returning()
      .execute();
    return collectedWaste;
  } catch (error) {
    console.error("Error saving collected waste:", error);
    throw error;
  }
}

export async function updateTaskStatus(reportId: number, newStatus: ReportStatus) {
  // The acting operator claims the task; collector is the session user.
  const me = await requireRole(COLLECTION_ROLES);
  const input = validate(updateTaskStatusSchema, { reportId, newStatus });
  try {
    const [updatedReport] = await db
      .update(Reports)
      .set({ status: input.newStatus, collector_id: me.userId })
      .where(eq(Reports.id, input.reportId))
      .returning()
      .execute();
    return updatedReport;
  } catch (error) {
    console.error("Error updating task status:", error);
    throw error;
  }
}

// --- Review / oversight: supervisor or admin --------------------------------

export async function getPendingReports() {
  await requireRole(REVIEW_ROLES);
  try {
    return await db.select().from(Reports).where(eq(Reports.status, "pending")).execute();
  } catch (error) {
    console.error("Error fetching pending reports:", error);
    return [];
  }
}

export async function updateReportStatus(reportId: number, status: ReportStatus) {
  await requireRole(REVIEW_ROLES);
  const input = validate(updateReportStatusSchema, { reportId, status });
  try {
    const [updatedReport] = await db
      .update(Reports)
      .set({ status: input.status })
      .where(eq(Reports.id, input.reportId))
      .returning()
      .execute();
    return updatedReport;
  } catch (error) {
    console.error("Error updating report status:", error);
    return null;
  }
}

// --- Operations views: any collection role ----------------------------------

export async function getRecentReports(limit: number = 10) {
  await requireRole(OPS_VIEW_ROLES);
  const { limit: lim } = validate(recentReportsSchema, { limit });
  try {
    return await db
      .select()
      .from(Reports)
      .orderBy(desc(Reports.created_at))
      .limit(lim)
      .execute();
  } catch (error) {
    console.error("Error fetching recent reports:", error);
    return [];
  }
}

export async function getWasteCollectionTasks(limit: number = 20) {
  await requireRole(OPS_VIEW_ROLES);
  const { limit: lim } = validate(wasteCollectionTasksSchema, { limit });
  try {
    const tasks = await db
      .select({
        id: Reports.id,
        location: Reports.location,
        wasteType: Reports.wasteType,
        amount: Reports.amount,
        status: Reports.status,
        date: Reports.created_at,
        collectorId: Reports.collector_id,
      })
      .from(Reports)
      .limit(lim)
      .execute();

    return tasks.map(task => ({
      ...task,
      date: task.date.toISOString().split('T')[0], // Format date as YYYY-MM-DD
    }));
  } catch (error) {
    console.error("Error fetching waste collection tasks:", error);
    return [];
  }
}
