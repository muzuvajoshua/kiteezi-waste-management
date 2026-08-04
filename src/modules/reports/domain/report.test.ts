import { describe, it, expect } from 'vitest';
import { validateStatusTransition, type ReportStatus } from './report';

describe('validateStatusTransition', () => {
  it('is currently a permissive pass-through for every status', () => {
    const statuses: ReportStatus[] = ['pending', 'approved', 'in_progress', 'collected', 'verified', 'rejected'];
    for (const status of statuses) {
      expect(validateStatusTransition(status)).toBe(status);
    }
  });
});
