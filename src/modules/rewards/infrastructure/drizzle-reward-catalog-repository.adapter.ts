import { eq } from 'drizzle-orm';
import type { Database } from '@/shared/infrastructure/persistence/database';
import { RewardCatalog } from '@/utils/db/schema';
import { RewardCatalogItem } from '../domain/reward-catalog-item';
import type { RewardCatalogRepository } from '../application/ports/reward-catalog-repository.port';

export class DrizzleRewardCatalogRepository implements RewardCatalogRepository {
  constructor(private readonly db: Database) {}

  async findAvailable(): Promise<readonly RewardCatalogItem[]> {
    const rows = await this.db
      .select({
        id: RewardCatalog.id,
        name: RewardCatalog.name,
        description: RewardCatalog.description,
        costPoints: RewardCatalog.costPoints,
        isAvailable: RewardCatalog.isAvailable,
      })
      .from(RewardCatalog)
      .where(eq(RewardCatalog.isAvailable, true))
      .execute();
    return rows.map((row) => RewardCatalogItem.from(row));
  }

  async findById(id: number): Promise<RewardCatalogItem | null> {
    const [row] = await this.db.select().from(RewardCatalog).where(eq(RewardCatalog.id, id)).execute();
    if (!row) return null;
    return RewardCatalogItem.from({
      id: row.id,
      name: row.name,
      description: row.description,
      costPoints: row.costPoints,
      isAvailable: row.isAvailable,
    });
  }
}
