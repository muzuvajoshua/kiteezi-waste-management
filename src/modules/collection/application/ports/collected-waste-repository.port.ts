import type { CollectedWaste, CollectedWasteStatus } from '../../domain/collected-waste';

export interface RecordCollectionInput {
  readonly reportId: number;
  readonly collectorId: number;
  readonly status: CollectedWasteStatus;
}

// `record` is the single write method KWM-020 asks for, consolidating what
// were two near-duplicate inserts (createCollectedWaste/saveCollectedWaste)
// differing only in their default `status`.
export interface CollectedWasteRepository {
  findByCollectorId(collectorId: number): Promise<CollectedWaste[]>;
  record(input: RecordCollectionInput): Promise<CollectedWaste>;
}
