"use server";

import { requireRole } from '@/modules/auth/presentation/auth-guards';
import { validate } from '@/lib/validation';
import type { Role } from '@/utils/db/schema';
import { collectedWasteRepository } from './composition';
import { listMyCollectedWastes } from '../application/list-my-collected-wastes.usecase';
import { recordCollection } from '../application/record-collection.usecase';
import { collectedWasteSchema } from './collection.schemas';

// KWM-009 — thin Presentation adapter: same exported names/return shapes as
// the legacy utils/db/actions.ts collection exports (no caller-visible
// behavior change), including the swallow-vs-rethrow inconsistency between
// saveCollectedWaste (rethrows) and createCollectedWaste (swallows to
// null) — preserved deliberately, not normalized away (see reports and
// notifications modules for the same discipline). Both wrap the single
// recordCollection use-case (KWM-020) with a different `status`.

const COLLECTION_ROLES: Role[] = ['operator', 'supervisor', 'admin'];

export async function getCollectedWastesByCollector() {
  const me = await requireRole(COLLECTION_ROLES);
  const result = await listMyCollectedWastes(collectedWasteRepository, me.userId);
  if (!result.ok) {
    console.error('Error fetching collected wastes:', result.error.message);
    return [];
  }
  return result.value;
}

export async function createCollectedWaste(reportId: number) {
  const me = await requireRole(COLLECTION_ROLES);
  const { reportId: id } = validate(collectedWasteSchema, { reportId });
  const result = await recordCollection(collectedWasteRepository, {
    reportId: id,
    collectorId: me.userId,
    status: 'collected',
  });
  if (!result.ok) {
    console.error('Error creating collected waste:', result.error.message);
    return null;
  }
  return result.value;
}

export async function saveCollectedWaste(reportId: number) {
  const me = await requireRole(COLLECTION_ROLES);
  const { reportId: id } = validate(collectedWasteSchema, { reportId });
  const result = await recordCollection(collectedWasteRepository, {
    reportId: id,
    collectorId: me.userId,
    status: 'verified',
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}
