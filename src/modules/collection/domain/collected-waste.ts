// Deliberately NOT imported from utils/db/schema.ts's
// collectedWasteStatusEnum: the Domain layer must not depend on Drizzle
// even for a type-only import. Mirrors the other modules' precedent.
export type CollectedWasteStatus = 'collected' | 'verified';

// A recorded collection event. Plain DTO — no invariant to protect, same
// reasoning as the notifications module's Notification.
export interface CollectedWaste {
  readonly id: number;
  readonly reportId: number;
  readonly collectorId: number;
  readonly collectionDate: Date;
  readonly status: CollectedWasteStatus;
}
