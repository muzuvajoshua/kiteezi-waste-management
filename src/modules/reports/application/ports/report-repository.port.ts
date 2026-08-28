import type { Report, ReportStatus, WasteType } from '../../domain/report';

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
export interface ReportRepository {
  findByUserId(userId: number): Promise<Report[]>;
  findPending(): Promise<Report[]>;
  findRecent(limit: number): Promise<Report[]>;
  findCollectionTasks(limit: number): Promise<CollectionTaskRow[]>;
  updateStatus(reportId: number, status: ReportStatus, opts?: UpdateReportStatusOptions): Promise<Report | null>;
}
