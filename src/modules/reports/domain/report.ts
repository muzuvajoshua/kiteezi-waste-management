// Deliberately NOT imported from utils/db/schema.ts's reportStatusEnum/
// wasteTypeEnum: the Domain layer must not depend on Drizzle even for a
// type-only import. Mirrors the rewards/auth modules' PointKind/Role
// precedent.
export type ReportStatus = 'pending' | 'approved' | 'in_progress' | 'collected' | 'verified' | 'rejected';
export type WasteType = 'general' | 'plastic' | 'organic' | 'metal' | 'paper' | 'ewaste' | 'hazardous' | 'other';

export interface Report {
  readonly id: number;
  readonly userId: number;
  readonly location: string;
  readonly wasteType: WasteType;
  readonly amount: string;
  readonly imageUrl: string | null;
  readonly verificationResult: unknown | null;
  readonly status: ReportStatus;
  readonly createdAt: Date;
  readonly collectorId: number | null;
  // KWM-032 — why a supervisor approved or rejected this. Null until
  // reviewed, and null for most approvals: only a rejection is required to
  // carry one (domain/review.ts). Shown to the reporter on /my-reports.
  readonly reviewReason: string | null;
}

/**
 * Validates a requested status transition before it's persisted. Currently
 * a permissive pass-through: unlike the reward ledger's
 * CHECK(points >= 0), there is no DB-level invariant on Reports.status to
 * extract, no test pins down a "valid" transition table, and no tracked
 * issue asks for one. Both update-report-status.usecase.ts (reviewer) and
 * update-task-status.usecase.ts (collector) route their target status
 * through this single function, so when real transition rules are defined
 * (file a follow-up issue for product input — e.g. is `pending -> verified`
 * actually forbidden, or just unusual?), there is exactly one place to add
 * them, without requiring a prior read of the current status that this
 * codebase's write paths don't do today.
 */
export function validateStatusTransition(newStatus: ReportStatus): ReportStatus {
  return newStatus;
}
