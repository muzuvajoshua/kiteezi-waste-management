import { z } from 'zod';
import {
  idSchema,
  limitSchema,
  locationSchema,
  amountSchema,
  imageUrlSchema,
  wasteTypeSchema,
  reportStatusSchema,
} from '@/utils/db/schemas/common';

// KWM-017 — report action input schemas. Relocated from
// utils/db/schemas/reports.ts as part of the reports module extraction;
// content unchanged.
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

// KWM-032 — bulk review.
//
// The batch cap is a real limit, not a formality: this is one UPDATE holding
// row locks, and it arrives from a "select all" checkbox, so without a bound a
// supervisor with a large inbox sends an unbounded statement. 200 is well
// above any plausible triage session and far below anything that would hold
// the table.
export const MAX_REVIEW_BATCH = 200;

// `decision` is NOT reportStatusSchema. Accepting any status here would let a
// review set `collected`, crediting a collection nobody made — the use-case
// refuses that too (domain/review.ts), but the schema is where the client gets
// a useful message rather than a generic one.
export const reviewReportsSchema = z.object({
  reportIds: z.array(idSchema).min(1).max(MAX_REVIEW_BATCH),
  decision: z.enum(['approved', 'rejected']),
  // Bounded because it is free text that ends up rendered to the reporter.
  // Optional here and required-when-rejecting in the domain: that rule depends
  // on `decision`, so it belongs with the other business rules rather than
  // being duplicated as a Zod refinement.
  reviewReason: z.string().trim().max(1000).optional(),
});

export const recentReportsSchema = z.object({ limit: limitSchema });
export const wasteCollectionTasksSchema = z.object({ limit: limitSchema });
