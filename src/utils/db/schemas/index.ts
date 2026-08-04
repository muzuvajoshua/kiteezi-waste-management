// KWM-017 — barrel for the validation schemas. Only `common.ts`'s shared
// primitives remain here: reward schemas moved to
// @/modules/rewards/presentation/reward.schemas (Phase 1); auth schemas to
// @/modules/auth/presentation/auth.schemas (Phase 2); notification, report,
// and collection schemas to their own modules' presentation layers
// (Phase 3).
export * from './common';
