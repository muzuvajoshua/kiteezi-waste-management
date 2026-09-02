import { describe, it, expect } from 'vitest';
import type { NotificationRepository } from '../application/ports/notification-repository.port';

export interface NotificationRepositoryContractHarness {
  readonly repository: NotificationRepository;
}

// Shared behavioral contract for any NotificationRepository implementation. Two
// files invoke it: in-memory-…adapter.test.ts with the fake, and
// drizzle-…adapter.test.ts against a real Postgres (KWM-063). Both run these
// same assertions, which is what stops the fake drifting from the
// implementation it stands in for.
//
// KWM-063 also made this a `.test-support.ts` module. It used to be a
// `.contract.test.ts` that both defined the contract AND ran it against the
// fake at import time, so a second file importing the function would re-run
// the whole in-memory suite inside itself.
export function testNotificationRepositoryContract(
  name: string,
  createHarness: () => NotificationRepositoryContractHarness
): void {
  describe(`NotificationRepository contract: ${name}`, () => {
    it('create then findById round-trips the notification', async () => {
      const { repository } = createHarness();
      const created = await repository.create({ userId: 7, message: 'hello', type: 'system' });
      expect(created).toMatchObject({ userId: 7, message: 'hello', type: 'system', isRead: false });
      expect(await repository.findById(created.id)).toEqual(created);
    });

    it('findById returns null for a missing notification', async () => {
      const { repository } = createHarness();
      expect(await repository.findById(999)).toBeNull();
    });

    it('findUnreadByUserId only returns unread notifications for that user', async () => {
      const { repository } = createHarness();
      const a = await repository.create({ userId: 1, message: 'a', type: 'reward' });
      await repository.create({ userId: 2, message: 'b', type: 'reward' });
      const c = await repository.create({ userId: 1, message: 'c', type: 'reward' });
      await repository.markRead(c.id);

      const unread = await repository.findUnreadByUserId(1);
      expect(unread.map((n) => n.id)).toEqual([a.id]);
    });

    it('markRead flips isRead to true', async () => {
      const { repository } = createHarness();
      const created = await repository.create({ userId: 7, message: 'x', type: 'collection' });
      await repository.markRead(created.id);
      expect(await repository.findById(created.id)).toMatchObject({ isRead: true });
    });
  });
}
