import { describe, it, expect } from 'vitest';
import { collectedWasteSchema } from './collection.schemas';

describe('collectedWasteSchema', () => {
  it('accepts a positive reportId', () => {
    expect(collectedWasteSchema.safeParse({ reportId: 1 }).success).toBe(true);
  });
  it('rejects a non-positive reportId', () => {
    expect(collectedWasteSchema.safeParse({ reportId: 0 }).success).toBe(false);
  });
});
