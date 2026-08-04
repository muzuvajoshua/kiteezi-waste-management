"use server";

import { db } from './dbConfig';
import { CollectedWastes } from './schema';
import type { Role } from './schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/modules/auth/presentation/auth-guards';
import { validate } from '@/lib/validation';
import { collectedWasteSchema } from './schemas';

// KWM-009 — every exported function is a "use server" action (a public RPC
// endpoint). The acting identity is ALWAYS derived from the session; user ids
// only ever appear as operation *targets*. Reward, auth, notification, and
// report reads/writes now live in their own modules (Phases 1-3 of the
// architecture transformation) — this file keeps only the CollectedWastes
// operations still pending extraction.

const COLLECTION_ROLES: Role[] = ['operator', 'supervisor', 'admin'];

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
