import { describe, it, expect } from 'vitest';
import type { CurrentUser } from '@/modules/auth/domain/current-user';
import { InMemoryNotificationRepository } from '../infrastructure/in-memory-notification-repository.adapter';
import { markNotificationRead } from './mark-notification-read.usecase';

function user(userId: number, roles: CurrentUser['roles'] = ['citizen']): CurrentUser {
  return { userId, email: 'user@example.com', name: 'Test User', roles };
}

describe('markNotificationRead', () => {
  it('marks the owner\'s notification as read', async () => {
    const repository = new InMemoryNotificationRepository();
    repository.seed({ id: 1, userId: 7, message: 'a', type: 'reward', isRead: false, createdAt: new Date() });

    const result = await markNotificationRead(repository, user(7), 1);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await repository.findById(1)).toMatchObject({ isRead: true });
  });

  it('is a silent no-op when the notification does not exist', async () => {
    const repository = new InMemoryNotificationRepository();
    const result = await markNotificationRead(repository, user(7), 999);
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('blocks a non-owner with no override role', async () => {
    const repository = new InMemoryNotificationRepository();
    repository.seed({ id: 1, userId: 7, message: 'a', type: 'reward', isRead: false, createdAt: new Date() });

    const result = await markNotificationRead(repository, user(8), 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
    expect(await repository.findById(1)).toMatchObject({ isRead: false }); // untouched
  });

  it('allows an admin to mark another user\'s notification as read', async () => {
    const repository = new InMemoryNotificationRepository();
    repository.seed({ id: 1, userId: 7, message: 'a', type: 'reward', isRead: false, createdAt: new Date() });

    const result = await markNotificationRead(repository, user(1, ['admin']), 1);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await repository.findById(1)).toMatchObject({ isRead: true });
  });
});
