import type { Report, ReportStatus, WasteType } from '../../domain/report';
import type { ReviewDecision } from '../../domain/review';

// Raw read-model row for the waste-collection-tasks view — narrower than
// Report and keeps `date` as a Date (the use-case, not this port, formats
// it to YYYY-MM-DD, so that mapping stays pure and testable in Application
// rather than baked into the query).
export interface CollectionTaskRow {
  readonly id: number;
  readonly location: string;
  readonly wasteType: WasteType;
  readonly amount: string;
  readonly status: ReportStatus;
  readonly date: Date;
  readonly collectorId: number | null;
}

export interface UpdateReportStatusOptions {
  // Present for the collector-initiated transition (updateTaskStatus);
  // absent for the reviewer-initiated one (updateReportStatus).
  readonly collectorId?: number;
}

// Read side + the one non-transactional write (status updates never need
// the atomicity createReport's points mint does — see
// report-write-unit-of-work.port.ts for that). Backed by the plain http
// client, not txdb, matching today's actual queries.
export interface ReviewReportsInput {
  readonly reportIds: readonly number[];
  readonly decision: ReviewDecision;
  // Already normalised by the domain (see domain/review.ts): trimmed, and
  // guaranteed non-null when the decision is a rejection.
  readonly reviewReason: string | null;
}

export interface ReportRepository {
  findByUserId(userId: number): Promise<Report[]>;
  findPending(): Promise<Report[]>;
  findRecent(limit: number): Promise<Report[]>;
  findCollectionTasks(limit: number): Promise<CollectionTaskRow[]>;
  updateStatus(reportId: number, status: ReportStatus, opts?: UpdateReportStatusOptions): Promise<Report | null>;

  /**
   * Applies one review decision to many reports at once, returning the rows
   * that changed.
   *
   * KWM-032. A supervisor triaging an inbox selects a batch and decides once,
   * so this is a single statement rather than a loop over `updateStatus`: N
   * round trips would be slow, and — worse — a partial failure would leave the
   * batch half-applied with no way to tell the supervisor which half.
   *
   * Only reports still `pending` are touched. Two supervisors working the same
   * inbox will both send overlapping batches, and the second must not overturn
   * the first's decision; the returned rows are what actually changed, so the
   * caller can report "3 of 5" honestly rather than claiming all five.
   */
  reviewMany(input: ReviewReportsInput): Promise<Report[]>;
}
