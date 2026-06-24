import { z } from 'zod';
import { idSchema, rewardIdSchema, pointsAmountSchema } from './common';

// KWM-017 — reward action input schemas.
export const redeemRewardSchema = z.object({ rewardId: rewardIdSchema });

// `amount` is the points granted to the recipient; capped by pointsAmountSchema.
export const saveRewardSchema = z.object({
  recipientUserId: idSchema,
  amount: pointsAmountSchema,
});
