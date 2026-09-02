import { eq } from 'drizzle-orm';
import type { Database } from '@/shared/infrastructure/persistence/database';
import { CollectedWastes } from '@/utils/db/schema';
import type { CollectedWaste } from '../domain/collected-waste';
import type {
  CollectedWasteRepository,
  RecordCollectionInput,
} from '../application/ports/collected-waste-repository.port';

// Relocated from utils/db/actions.ts. No try/catch: errors propagate, the
// use-case's try/catch is the one mapping point (Phase 1/2/3a/3b
// precedent). Needs no transaction — a single insert/select each.
//
// KWM-063: the connection is a constructor argument, not the module-scope
// `db` this used to import. That import ran at load time, so the adapter
// could never be pointed at a test database and had no test at all; it now
// runs the shared contract suite against a real Postgres. Same injection the
// module already uses for GoogleIdentityProvider and ScryptPasswordHasher.
export class DrizzleCollectedWasteRepository implements CollectedWasteRepository {
  constructor(private readonly db: Database) {}

  async findByCollectorId(collectorId: number): Promise<CollectedWaste[]> {
    return this.db
      .select()
      .from(CollectedWastes)
      .where(eq(CollectedWastes.collectorId, collectorId))
      .execute();
  }

  async record(input: RecordCollectionInput): Promise<CollectedWaste> {
    const [created] = await this.db
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
