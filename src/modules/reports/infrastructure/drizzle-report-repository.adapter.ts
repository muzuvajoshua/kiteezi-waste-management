import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '@/shared/infrastructure/persistence/database';
import { Reports } from '@/utils/db/schema';
import type { Report, ReportStatus } from '../domain/report';
import type {
  ReportRepository,
  CollectionTaskRow,
  UpdateReportStatusOptions,
  ReviewReportsInput,
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

  async reviewMany(input: ReviewReportsInput): Promise<Report[]> {
    // Returns before touching the database on an empty selection. Drizzle's
    // `inArray` with an empty list emits `WHERE false`, which is harmless
    // here, but the guard is explicit because the shape of this statement —
    // an UPDATE whose only bound is an id list — is one where a builder
    // quietly dropping the predicate would review the entire table.
    if (input.reportIds.length === 0) return [];

    const rows = await this.db
      .update(Reports)
      .set({ status: input.decision, review_reason: input.reviewReason })
      .where(
        and(
          inArray(Reports.id, [...input.reportIds]),
          // Only pending reports. Without this a second supervisor's
          // overlapping batch would overturn the first's decision, and a
          // report already collected could be dragged back to rejected.
          eq(Reports.status, 'pending')
        )
      )
      .returning()
      .execute();

    // Ordered by the ids as given: Postgres returns updated rows in whatever
    // order it touched them, and a caller reporting on the batch deserves a
    // stable one.
    const byId = new Map(rows.map((row) => [row.id, mapRow(row)]));
    return input.reportIds.map((id) => byId.get(id)).filter((r): r is Report => r !== undefined);
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
    reviewReason: row.review_reason,
  };
}
