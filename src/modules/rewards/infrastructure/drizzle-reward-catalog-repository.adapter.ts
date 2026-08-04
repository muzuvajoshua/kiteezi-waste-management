import { eq } from 'drizzle-orm';
import { db } from '@/utils/db/dbConfig';
import { RewardCatalog } from '@/utils/db/schema';
import { RewardCatalogItem } from '../domain/reward-catalog-item';
import type { RewardCatalogRepository } from '../application/ports/reward-catalog-repository.port';

export class DrizzleRewardCatalogRepository implements RewardCatalogRepository {
  async findAvailable(): Promise<readonly RewardCatalogItem[]> {
    const rows = await db
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
    const [row] = await db.select().from(RewardCatalog).where(eq(RewardCatalog.id, id)).execute();
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
