import { z } from 'zod';
import { wasteTypeEnum, reportStatusEnum } from '../schema';

// KWM-017 — shared validation primitives. Enum schemas are derived from the
// drizzle pgEnums (single source of truth) so they cannot drift from the DB.

// Temporary per-grant points cap (KWM-017). No business rule for reward sizing
// exists yet; `createReport` mints a fixed 10 and realistic collection rewards
// are tens-to-hundreds of points, so 10_000 is generous headroom while still
// blocking absurd/typo/abuse grants (e.g. an operator minting millions). Revisit
// when KWM-011 introduces the canonical point-transaction ledger + business rules.
export const MAX_POINTS = 10_000;

export const idSchema = z.number().int().positive();
export const rewardIdSchema = z.number().int().nonnegative(); // 0 = redeem-all sentinel
export const limitSchema = z.number().int().positive().max(100);
export const pointsAmountSchema = z.number().int().positive().max(MAX_POINTS);

export const wasteTypeSchema = z.enum(wasteTypeEnum.enumValues);
export const reportStatusSchema = z.enum(reportStatusEnum.enumValues);

export const locationSchema = z.string().trim().min(1).max(500);

// Reported waste quantity is stored as varchar; require a positive numeric string
// without changing the column (no migration in KWM-017).
export const amountSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .refine((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  }, { message: 'amount must be a positive number' });

// Version-agnostic https URL check (avoids zod v3/v4 `.url()` API differences).
export const imageUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((v) => {
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }, { message: 'imageUrl must be a valid https URL' });
