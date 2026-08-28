import { eq } from 'drizzle-orm';
import { db } from '@/utils/db/dbConfig';
import { CollectedWastes } from '@/utils/db/schema';
import type { CollectedWaste } from '../domain/collected-waste';
import type {
  CollectedWasteRepository,
  RecordCollectionInput,
} from '../application/ports/collected-waste-repository.port';

// Relocated from utils/db/actions.ts. No try/catch: errors propagate, the
// use-case's try/catch is the one mapping point (Phase 1/2/3a/3b
// precedent). Uses the plain http client — same as today, no transaction
// needed for a single insert/select.
export class DrizzleCollectedWasteRepository implements CollectedWasteRepository {
  async findByCollectorId(collectorId: number): Promise<CollectedWaste[]> {
    return db.select().from(CollectedWastes).where(eq(CollectedWastes.collectorId, collectorId)).execute();
  }

  async record(input: RecordCollectionInput): Promise<CollectedWaste> {
    const [created] = await db
      .insert(CollectedWastes)
      .values({
        reportId: input.reportId,
        collectorId: input.collectorId,
        collectionDate: new Date(),
        status: input.status,
      })
      .returning()
      .execute();
    return created;
  }
}
