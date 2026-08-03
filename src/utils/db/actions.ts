"use server";

import { db } from './dbConfig';
import { txdb } from './txClient';
import { Users, Reports, CollectedWastes, Notifications, RewardCatalog, UserRewardBalance, PointTransactions } from './schema';
import type { ReportStatus, WasteType, Role } from './schema';
import { eq, sql, and, desc } from 'drizzle-orm';
import { requireUser, requireRole, requireOwnership } from '@/lib/rbac';
import { recordPointTransaction, getBalance, getPointTransactions, createNotification } from './internal';
import { validate } from '@/lib/validation';
import { InsufficientPointsError, RewardUnavailableError } from '@/lib/errors';
import {
  createReportSchema,
  updateReportStatusSchema,
  updateTaskStatusSchema,
  recentReportsSchema,
  wasteCollectionTasksSchema,
  redeemRewardSchema,
  saveRewardSchema,
  rewardTransactionsQuerySchema,
  collectedWasteSchema,
  markNotificationReadSchema,
} from './schemas';

// KWM-009 — every exported function is a "use server" action (a public RPC
// endpoint). The acting identity is ALWAYS derived from the session; user ids
// only ever appear as operation *targets* (e.g. saveReward's recipient).
// KWM-011/012/018 — reward writes are atomic (txdb transaction + materialised
// balance kept in lockstep with the append-only ledger); balance reads come
// from user_reward_balance, never from summing a truncated transaction list.

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
      await recordPointTransaction(tx, {
        userId: me.userId,
        kind: 'earn_report',
        amount: 10,
        relatedReportId: created.id,
        idempotencyKey: `report:${created.id}:earn`,
      });

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

// --- Rewards (KWM-011/012) --------------------------------------------------

export async function getUserBalance(): Promise<number> {
  const me = await requireUser();
  return getBalance(me.userId); // materialised balance — no pagination dependency
}

export async function getRewardTransactions(
  limit: number = 20,
  cursor?: { createdAt: Date | string; id: number }
) {
  const me = await requireUser();
  const input = validate(rewardTransactionsQuerySchema, { limit, cursor });
  try {
    return await getPointTransactions(me.userId, { limit: input.limit, cursor: input.cursor });
  } catch (error) {
    console.error("Error fetching reward transactions:", error);
    return { items: [], nextCursor: null };
  }
}

export async function getAvailableRewards() {
  const me = await requireUser();
  try {
    const balance = await getBalance(me.userId);
    const items = await db
      .select({
        id: RewardCatalog.id,
        name: RewardCatalog.name,
        description: RewardCatalog.description,
        costPoints: RewardCatalog.costPoints,
      })
      .from(RewardCatalog)
      .where(eq(RewardCatalog.isAvailable, true))
      .execute();
    return { balance, items };
  } catch (error) {
    console.error("Error fetching available rewards:", error);
    return { balance: 0, items: [] };
  }
}

export async function redeemReward(rewardId: number) {
  const me = await requireUser();
  const { rewardId: id } = validate(redeemRewardSchema, { rewardId });

  return txdb.transaction(async (tx) => {
    const [bal] = await tx
      .select({ points: UserRewardBalance.points })
      .from(UserRewardBalance)
      .where(eq(UserRewardBalance.userId, me.userId))
      .for('update');
    const points = bal?.points ?? 0;

    if (id === 0) {
      // Redeem the entire balance.
      if (points <= 0) return { balance: 0 };
      await tx.insert(PointTransactions).values({ userId: me.userId, kind: 'redeem', amount: -points });
      await tx
        .update(UserRewardBalance)
        .set({ points: 0, updatedAt: new Date() })
        .where(eq(UserRewardBalance.userId, me.userId));
      return { balance: 0 };
    }

    const [item] = await tx.select().from(RewardCatalog).where(eq(RewardCatalog.id, id)).execute();
    if (!item || !item.isAvailable) throw new RewardUnavailableError();
    if (points < item.costPoints) throw new InsufficientPointsError();

    await tx.insert(PointTransactions).values({
      userId: me.userId,
      kind: 'redeem',
      amount: -item.costPoints,
      relatedRedemptionId: item.id,
    });
    await tx
      .update(UserRewardBalance)
      .set({ points: sql`${UserRewardBalance.points} - ${item.costPoints}`, updatedAt: new Date() })
      .where(eq(UserRewardBalance.userId, me.userId));
    return { balance: points - item.costPoints };
  });
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

// saveReward awards points to a *recipient* (a reporter) — actor is an authorised
// operator/admin from the session. NOT idempotent without a caller-supplied
// stable key (deterministic dedup deferred to KWM-031).
export async function saveReward(recipientUserId: number, amount: number, idempotencyKey?: string) {
  await requireRole(COLLECTION_ROLES);
  const input = validate(saveRewardSchema, { recipientUserId, amount, idempotencyKey });

  return txdb.transaction(async (tx) => {
    const applied = await recordPointTransaction(tx, {
      userId: input.recipientUserId,
      kind: 'earn_collect',
      amount: input.amount,
      idempotencyKey: input.idempotencyKey ?? null,
    });
    return { applied };
  });
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

export async function getAllRewards() {
  await requireRole(REVIEW_ROLES);
  try {
    return await db
      .select({
        userId: UserRewardBalance.userId,
        points: UserRewardBalance.points,
        userName: Users.name,
      })
      .from(UserRewardBalance)
      .leftJoin(Users, eq(UserRewardBalance.userId, Users.id))
      .orderBy(desc(UserRewardBalance.points))
      .execute();
  } catch (error) {
    console.error("Error fetching all rewards:", error);
    return [];
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
