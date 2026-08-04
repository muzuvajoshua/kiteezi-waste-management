import { describe, it, expect } from 'vitest';
import { InMemoryNotificationRepository } from '../infrastructure/in-memory-notification-repository.adapter';
import { getUnreadNotifications } from './get-unread-notifications.usecase';

describe('getUnreadNotifications', () => {
  it('returns only the unread notifications for the given user', async () => {
    const repository = new InMemoryNotificationRepository();
    repository.seed({ id: 1, userId: 7, message: 'a', type: 'reward', isRead: false, createdAt: new Date() });
    repository.seed({ id: 2, userId: 7, message: 'b', type: 'system', isRead: true, createdAt: new Date() });
    repository.seed({ id: 3, userId: 8, message: 'c', type: 'reward', isRead: false, createdAt: new Date() });

    const result = await getUnreadNotifications(repository, 7);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].id).toBe(1);
    }
  });
});
