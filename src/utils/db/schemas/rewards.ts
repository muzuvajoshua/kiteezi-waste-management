import { z } from 'zod';
import { idSchema, rewardIdSchema, pointsAmountSchema, limitSchema } from './common';

// KWM-017/012 — reward action input schemas.
export const redeemRewardSchema = z.object({ rewardId: rewardIdSchema });

// `amount` is the points granted to the recipient; capped by pointsAmountSchema.
// `idempotencyKey` is OPTIONAL: saveReward makes no idempotency guarantee
// without a caller-supplied stable key — deterministic dedup is deferred to
// KWM-031 (which provides a collection-event id). See KWM-011 blueprint.
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
