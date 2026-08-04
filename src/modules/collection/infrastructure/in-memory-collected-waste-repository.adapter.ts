import type { CollectedWaste } from '../domain/collected-waste';
import type {
  CollectedWasteRepository,
  RecordCollectionInput,
} from '../application/ports/collected-waste-repository.port';

export class InMemoryCollectedWasteRepository implements CollectedWasteRepository {
  private readonly items = new Map<number, CollectedWaste>();
  private nextId = 1;

  seed(item: CollectedWaste): void {
    this.items.set(item.id, item);
    if (item.id >= this.nextId) this.nextId = item.id + 1;
  }

  async findByCollectorId(collectorId: number): Promise<CollectedWaste[]> {
    return [...this.items.values()].filter((i) => i.collectorId === collectorId);
  }

  async record(input: RecordCollectionInput): Promise<CollectedWaste> {
    const item: CollectedWaste = {
      id: this.nextId++,
      reportId: input.reportId,
      collectorId: input.collectorId,
      collectionDate: new Date(),
      status: input.status,
    };
    this.items.set(item.id, item);
    return item;
  }
}
