import { eq, desc } from 'drizzle-orm';
import type { Database } from '@/shared/infrastructure/persistence/database';
import { Reports } from '@/utils/db/schema';
import type { Report, ReportStatus } from '../domain/report';
import type {
  ReportRepository,
  CollectionTaskRow,
  UpdateReportStatusOptions,
} from '../application/ports/report-repository.port';

// Relocated from utils/db/actions.ts. No try/catch: errors propagate, the
// use-case's try/catch is the one mapping point (Phase 1/2/3a precedent).
export class DrizzleReportRepository implements ReportRepository {
  constructor(private readonly db: Database) {}

  async findByUserId(userId: number): Promise<Report[]> {
    const rows = await this.db.select().from(Reports).where(eq(Reports.user_id, userId)).execute();
    return rows.map(mapRow);
  }

  async findPending(): Promise<Report[]> {
    const rows = await this.db.select().from(Reports).where(eq(Reports.status, 'pending')).execute();
    return rows.map(mapRow);
  }

  async findRecent(limit: number): Promise<Report[]> {
    const rows = await this.db.select().from(Reports).orderBy(desc(Reports.created_at)).limit(limit).execute();
    return rows.map(mapRow);
  }

  async findCollectionTasks(limit: number): Promise<CollectionTaskRow[]> {
    return this.db
      .select({
        id: Reports.id,
        location: Reports.location,
        wasteType: Reports.wasteType,
        amount: Reports.amount,
        status: Reports.status,
        date: Reports.created_at,
        collectorId: Reports.collector_id,
      })
      .from(Reports)
      .limit(limit)
      .execute();
  }

  async updateStatus(
    reportId: number,
    status: ReportStatus,
    opts?: UpdateReportStatusOptions
  ): Promise<Report | null> {
    const [updated] = await this.db
      .update(Reports)
      .set(opts?.collectorId !== undefined ? { status, collector_id: opts.collectorId } : { status })
      .where(eq(Reports.id, reportId))
      .returning()
      .execute();
    return updated ? mapRow(updated) : null;
  }
}

function mapRow(row: typeof Reports.$inferSelect): Report {
  return {
    id: row.id,
    userId: row.user_id,
    location: row.location,
    wasteType: row.wasteType,
    amount: row.amount,
    imageUrl: row.imageUrl,
    verificationResult: row.verificationResult,
    status: row.status,
    createdAt: row.created_at,
    collectorId: row.collector_id,
  };
}
