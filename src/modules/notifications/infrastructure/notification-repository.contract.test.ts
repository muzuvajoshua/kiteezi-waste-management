import { describe, it, expect } from 'vitest';
import type { NotificationRepository } from '../application/ports/notification-repository.port';
import { InMemoryNotificationRepository } from './in-memory-notification-repository.adapter';

export interface NotificationRepositoryContractHarness {
  readonly repository: NotificationRepository;
}

// Shared behavioral contract for any NotificationRepository implementation.
// Run here against the in-memory fake; re-run against
// DrizzleNotificationRepository once a live/staging Postgres is available
// in CI (KWM-063) — intentionally NOT wired up yet, matching the rewards
// and auth modules' contract tests (no live DB in this environment).
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

testNotificationRepositoryContract('InMemoryNotificationRepository', () => ({
  repository: new InMemoryNotificationRepository(),
}));
