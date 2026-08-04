import type { RewardCatalogItem } from '../../domain/reward-catalog-item';

export interface RewardCatalogRepository {
  findAvailable(): Promise<readonly RewardCatalogItem[]>;
  findById(id: number): Promise<RewardCatalogItem | null>;
}
