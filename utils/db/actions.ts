"use server";

import { db } from './dbConfig';
import { Users, Reports, Rewards, CollectedWastes, Notifications, Transactions } from './schema';
import type { ReportStatus, WasteType, Role } from './schema';
import { eq, sql, and, desc } from 'drizzle-orm';
import { requireUser, requireRole, requireOwnership } from '@/lib/rbac';
import { updateRewardPoints, createTransaction, createNotification, getOrCreateReward } from './internal';
import { validate } from '@/lib/validation';
import {
  createReportSchema,
  updateReportStatusSchema,
  updateTaskStatusSchema,
  recentReportsSchema,
  wasteCollectionTasksSchema,
  redeemRewardSchema,
  saveRewardSchema,
  collectedWasteSchema,
  markNotificationReadSchema,
} from './schemas';

// KWM-009 — every exported function here is a "use server" action, i.e. a
// public RPC endpoint. The acting identity is ALWAYS derived from the session
// (requireUser / requireRole / requireOwnership) and never accepted as a
// caller-supplied argument. Privileged operations are gated by role; user
// identities only ever appear as *targets* of an operation an authorised actor
// performs (e.g. saveReward's recipient), never as the actor. This closes C-4.

const COLLECTION_ROLES: Role[] = ['operator', 'supervisor', 'admin'];
const REVIEW_ROLES: Role[] = ['supervisor', 'admin'];
const OPS_VIEW_ROLES: Role[] = ['operator', 'supervisor', 'admin'];

interface UserReward {
  id: number;
  user_id: number;
  points: number;
  name: string;
  isAvailable: boolean;
}

// --- Self-service: the actor is the session user ----------------------------

export async function createReport(
  location: string,
  wasteType: WasteType,
  amount: string,
  imageUrl?: string
) {
  const me = await requireUser();
  const input = validate(createReportSchema, { location, wasteType, amount, imageUrl });
  try {
    const [report] = await db
      .insert(Reports)
      .values({
        user_id: me.userId,
        location: input.location,
        wasteType: input.wasteType,
        amount: input.amount,
        imageUrl: input.imageUrl,
        // Set server-side (pending) — the AI verdict is never client-trusted;
        // trusted verification arrives in KWM-043.
        verificationResult: null,
        status: "pending",
      })
      .returning()
      .execute();

    // Award 10 points for reporting waste.
    const pointsEarned = 10;
    await updateRewardPoints(me.userId, pointsEarned);
    await createTransaction(me.userId, 'earned_report', pointsEarned, 'Points earned for reporting waste');
    await createNotification(
      me.userId,
      `You've earned ${pointsEarned} points for reporting waste!`,
      'reward'
    );

    return report;
  } catch (error) {
    console.error("Error creating report:", error);
    return null;
  }
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

export async function getRewardTransactions() {
  const me = await requireUser();
  try {
    const transactions = await db
      .select({
        id: Transactions.id,
        type: Transactions.type,
        amount: Transactions.amount,
        description: Transactions.description,
        date: Transactions.date,
      })
      .from(Transactions)
      .where(eq(Transactions.userId, me.userId))
      .orderBy(desc(Transactions.date))
      .limit(10)
      .execute();

    return transactions.map(t => ({
      ...t,
      date: t.date.toISOString().split('T')[0], // Format date as YYYY-MM-DD
    }));
  } catch (error) {
    console.error("Error fetching reward transactions:", error);
    return [];
  }
}

export async function getAvailableRewards() {
  await requireUser();
  try {
    // getRewardTransactions also enforces the session; identity flows from there.
    const userTransactions = await getRewardTransactions();
    const userPoints = userTransactions.reduce((total, transaction) => {
      return transaction.type.startsWith('earned') ? total + transaction.amount : total - transaction.amount;
    }, 0);

    const dbRewards = await db
      .select({
        id: Rewards.id,
        name: Rewards.name,
        cost: Rewards.points,
        description: Rewards.description,
        collectionInfo: Rewards.collectionInfor,
      })
      .from(Rewards)
      .where(eq(Rewards.isAvailable, true))
      .execute();

    return [
      {
        id: 0, // Special ID for the user's own points balance.
        name: "Your Points",
        cost: userPoints,
        description: "Redeem your earned points",
        collectionInfo: "Points earned from reporting and collecting waste"
      },
      ...dbRewards
    ];
  } catch (error) {
    console.error("Error fetching available rewards:", error);
    return [];
  }
}

export async function getUserBalance(): Promise<number> {
  await requireUser();
  const transactions = await getRewardTransactions();
  const balance = transactions.reduce((acc, transaction) => {
    return transaction.type.startsWith('earned') ? acc + transaction.amount : acc - transaction.amount;
  }, 0);
  return Math.max(balance, 0); // Ensure balance is never negative.
}

export async function redeemReward(rewardId: number) {
  const me = await requireUser();
  const { rewardId: id } = validate(redeemRewardSchema, { rewardId });
  try {
    const userReward = await getOrCreateReward(me.userId) as UserReward | null;

    if (id === 0) {
      // Redeem all points.
      const [updatedReward] = await db.update(Rewards)
        .set({ points: 0, updatedAt: new Date() })
        .where(eq(Rewards.user_id, me.userId))
        .returning()
        .execute();

      if (userReward) {
        await createTransaction(me.userId, 'redeemed', userReward.points, `Redeemed all points: ${userReward.points}`);
      }

      return updatedReward;
    } else {
      const availableReward = await db.select().from(Rewards).where(eq(Rewards.id, id)).execute();

      if (!userReward || !availableReward[0] || userReward.points < availableReward[0].points) {
        throw new Error("Insufficient points or invalid reward");
      }

      const [updatedReward] = await db.update(Rewards)
        .set({
          points: sql`${Rewards.points} - ${availableReward[0].points}`,
          updatedAt: new Date(),
        })
        .where(eq(Rewards.user_id, me.userId))
        .returning()
        .execute();

      await createTransaction(me.userId, 'redeemed', availableReward[0].points, `Redeemed: ${availableReward[0].name}`);

      return updatedReward;
    }
  } catch (error) {
    console.error("Error redeeming reward:", error);
    throw error;
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
  // The acting operator claims the task; collector is the session user, never a
  // caller-supplied id.
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

// saveReward awards points to a *recipient* (a reporter) — the actor is an
// authorised operator/admin resolved from the session, not the recipient.
export async function saveReward(recipientUserId: number, amount: number) {
  await requireRole(COLLECTION_ROLES);
  const input = validate(saveRewardSchema, { recipientUserId, amount });
  try {
    const [reward] = await db
      .insert(Rewards)
      .values({
        user_id: input.recipientUserId,
        name: 'Waste Collection Reward',
        collectionInfor: 'Points earned from waste collection',
        points: input.amount,
        isAvailable: true,
      })
      .returning()
      .execute();

    await createTransaction(input.recipientUserId, 'earned_collect', input.amount, 'Points earned for collecting waste');

    return reward;
  } catch (error) {
    console.error("Error saving reward:", error);
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

export async function getAllRewards() {
  await requireRole(REVIEW_ROLES);
  try {
    return await db
      .select({
        id: Rewards.id,
        userId: Rewards.user_id,
        points: Rewards.points,
        createdAt: Rewards.createdAt,
        userName: Users.name,
      })
      .from(Rewards)
      .leftJoin(Users, eq(Rewards.user_id, Users.id))
      .orderBy(desc(Rewards.points))
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
