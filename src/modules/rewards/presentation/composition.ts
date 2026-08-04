import { DrizzleRewardRepository } from '../infrastructure/drizzle-reward-repository.adapter';
import { DrizzleRewardCatalogRepository } from '../infrastructure/drizzle-reward-catalog-repository.adapter';
import { DrizzleRewardTransactionManager } from '../infrastructure/drizzle-reward-ledger-unit-of-work.adapter';

// This module's slice of the composition root: module-scope singletons, the
// same lazy/cheap-construction pattern utils/db/dbConfig.ts's `db` and
// utils/db/txClient.ts's `txdb` already use (no per-request setup cost in
// the serverless Server Action runtime). reward.actions.ts is the only
// caller — nothing outside Presentation reaches into Infrastructure
// directly.
export const rewardRepository = new DrizzleRewardRepository();
export const rewardCatalogRepository = new DrizzleRewardCatalogRepository();
export const rewardTransactionManager = new DrizzleRewardTransactionManager();
