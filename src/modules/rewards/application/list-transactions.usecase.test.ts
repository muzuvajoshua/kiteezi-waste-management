import { describe, it, expect } from 'vitest';
import { InMemoryRewardRepository } from '../infrastructure/in-memory-reward-repository.adapter';
import { listTransactions } from './list-transactions.usecase';

describe('listTransactions', () => {
  it('returns the most recent page first', async () => {
    const repository = new InMemoryRewardRepository();
    repository.seedTransaction(7, {
      kind: 'earn_report',
      amount: 10,
      relatedReportId: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    repository.seedTransaction(7, {
      kind: 'earn_report',
      amount: 10,
      relatedReportId: 2,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });

    const result = await listTransactions(repository, { userId: 7, limit: 10 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toHaveLength(2);
      expect(result.value.items[0].relatedReportId).toBe(2); // newest first
      expect(result.value.nextCursor).toBeNull();
    }
  });

  it('paginates via a keyset cursor when there are more rows than the limit', async () => {
    const repository = new InMemoryRewardRepository();
    for (let i = 0; i < 3; i++) {
      repository.seedTransaction(7, {
        kind: 'earn_report',
        amount: 10,
        relatedReportId: i,
        createdAt: new Date(2026, 0, i + 1),
      });
    }

    const firstPage = await listTransactions(repository, { userId: 7, limit: 2 });
    expect(firstPage.ok).toBe(true);
    if (!firstPage.ok) return;
    expect(firstPage.value.items).toHaveLength(2);
    expect(firstPage.value.nextCursor).not.toBeNull();

    const secondPage = await listTransactions(repository, {
      userId: 7,
      limit: 2,
      cursor: firstPage.value.nextCursor!,
    });
    expect(secondPage.ok).toBe(true);
    if (secondPage.ok) {
      expect(secondPage.value.items).toHaveLength(1);
      expect(secondPage.value.nextCursor).toBeNull();
    }
  });
});
