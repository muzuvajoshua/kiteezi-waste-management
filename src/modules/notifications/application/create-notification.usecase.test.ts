import { describe, it, expect } from 'vitest';
import { InMemoryNotificationRepository } from '../infrastructure/in-memory-notification-repository.adapter';
import { createNotification } from './create-notification.usecase';

describe('createNotification', () => {
  it('creates an unread notification for the target user', async () => {
    const repository = new InMemoryNotificationRepository();

    const result = await createNotification(repository, 7, "You've earned 10 points", 'reward');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ userId: 7, message: "You've earned 10 points", type: 'reward', isRead: false });
    }
    expect(await repository.findUnreadByUserId(7)).toHaveLength(1);
  });
});
