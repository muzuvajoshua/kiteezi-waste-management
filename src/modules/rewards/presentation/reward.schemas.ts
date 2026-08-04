import { z } from 'zod';
import { idSchema, rewardIdSchema, pointsAmountSchema, limitSchema } from '@/utils/db/schemas/common';

// KWM-017/012 — reward action input schemas. Relocated from
// utils/db/schemas/rewards.ts as part of the rewards module extraction;
// content unchanged. `common.ts` (shared Zod primitives used by
// reports/collection/notifications too) stays in utils/db/schemas per
// ADR-011's scope boundary.
export const redeemRewardSchema = z.object({ rewardId: rewardIdSchema });

// `amount` is the points granted to the recipient; capped by pointsAmountSchema.
// `idempotencyKey` is OPTIONAL: saveReward makes no idempotency guarantee
// without a caller-supplied stable key — deterministic dedup is deferred to
// KWM-031 (which provides a collection-event id).
export const saveRewardSchema = z.object({
  recipientUserId: idSchema,
  amount: pointsAmountSchema,
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
});

// KWM-012 — paginated activity list (NOT used for balance). Keyset cursor on
// (created_at, id).
export const rewardTransactionsQuerySchema = z.object({
  limit: limitSchema,
  cursor: z
    .object({ createdAt: z.coerce.date(), id: idSchema })
    .optional(),
});
