import { z } from 'zod';
import {
  idSchema,
  limitSchema,
  locationSchema,
  amountSchema,
  imageUrlSchema,
  wasteTypeSchema,
  reportStatusSchema,
} from './common';

// KWM-017 — report action input schemas.
//
// createReport no longer accepts `verificationResult` or the unused `type`
// param: the AI verdict must not be client-trusted (it is set server-side as
// pending until KWM-043 introduces trusted verification).
export const createReportSchema = z.object({
  location: locationSchema,
  wasteType: wasteTypeSchema,
  amount: amountSchema,
  imageUrl: imageUrlSchema.optional(),
});

export const updateReportStatusSchema = z.object({
  reportId: idSchema,
  status: reportStatusSchema,
});

export const updateTaskStatusSchema = z.object({
  reportId: idSchema,
  newStatus: reportStatusSchema,
});

export const recentReportsSchema = z.object({ limit: limitSchema });
export const wasteCollectionTasksSchema = z.object({ limit: limitSchema });
