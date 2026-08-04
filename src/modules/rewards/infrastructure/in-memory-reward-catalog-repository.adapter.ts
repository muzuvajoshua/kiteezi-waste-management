import { RewardCatalogItem, type RewardCatalogItemProps } from '../domain/reward-catalog-item';
import type { RewardCatalogRepository } from '../application/ports/reward-catalog-repository.port';

export class InMemoryRewardCatalogRepository implements RewardCatalogRepository {
  private readonly items = new Map<number, RewardCatalogItemProps>();

  seed(item: RewardCatalogItemProps): void {
    this.items.set(item.id, item);
  }

  async findAvailable(): Promise<readonly RewardCatalogItem[]> {
    return [...this.items.values()].filter((item) => item.isAvailable).map((item) => RewardCatalogItem.from(item));
  }

  async findById(id: number): Promise<RewardCatalogItem | null> {
    const item = this.items.get(id);
    return item ? RewardCatalogItem.from(item) : null;
  }
}
