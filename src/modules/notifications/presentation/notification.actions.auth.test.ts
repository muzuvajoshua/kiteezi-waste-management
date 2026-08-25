import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthenticatedError } from '@/modules/auth/domain/errors';
import { authHarness } from '@/modules/auth/presentation/action-auth.test-support';

// Authorization enforcement at the ACTION boundary for the notifications
// module. See report.actions.auth.test.ts for why the composition root is the
// seam.
//
// This is the only module with an OWNERSHIP check rather than a role check:
// markNotificationAsRead may only touch a notification belonging to the
// caller (admins excepted). It is also the only place the codebase converts a
// FORBIDDEN Result back into a throw, so that behaviour is pinned here too.

vi.mock('@/modules/auth/presentation/composition', async () => {
  const { buildAuthComposition } = await import(
    '@/modules/auth/presentation/action-auth.test-support'
  );
  return buildAuthComposition();
});

const auth = authHarness();

vi.mock('./composition', async () => {
  const { InMemoryNotificationRepository } = await import(
    '../infrastructure/in-memory-notification-repository.adapter'
  );
  return { notificationRepository: new InMemoryNotificationRepository() };
});

beforeEach(async () => {
  await auth.reset();
});

type Actions = typeof import('./notification.actions');

async function actions(): Promise<Actions> {
  return import('./notification.actions');
}

interface SeedableNotifications {
  seed(notification: {
    id: number;
    userId: number;
    message: string;
    type: string;
    isRead: boolean;
    createdAt: Date;
  }): void;
}

async function seedNotification(id: number, userId: number): Promise<void> {
  const { notificationRepository } = await import('./composition');
  (notificationRepository as unknown as SeedableNotifications).seed({
    id,
    userId,
    message: `notification ${id}`,
    type: 'system',
    isRead: false,
    createdAt: new Date(),
  });
}

describe('notification.actions authorization', () => {
  describe('every action rejects an unauthenticated caller', () => {
    it('getUnreadNotifications throws UnauthenticatedError with no session', async () => {
      await auth.signOut();
      await expect((await actions()).getUnreadNotifications()).rejects.toBeInstanceOf(
        UnauthenticatedError
      );
    });

    it('markNotificationAsRead throws UnauthenticatedError with no session', async () => {
      await auth.signOut();
      await expect((await actions()).markNotificationAsRead(1)).rejects.toBeInstanceOf(
        UnauthenticatedError
      );
    });
  });

  describe('any authenticated role may use its own notifications', () => {
    for (const role of ['citizen', 'operator', 'supervisor', 'admin', 'dump_op'] as const) {
      it(`getUnreadNotifications admits a ${role}`, async () => {
        await auth.signInAs({ roles: [role] });
        await expect((await actions()).getUnreadNotifications()).resolves.toBeDefined();
      });
    }
  });

  describe('ownership is enforced on markNotificationAsRead', () => {
    it('refuses to mark another user\'s notification as read', async () => {
      await seedNotification(100, 8);
      await auth.signInAs({ userId: 7, roles: ['citizen'] });

      // The action rethrows FORBIDDEN as a plain Error carrying the domain
      // message (its documented behaviour) rather than swallowing it like an
      // infrastructure fault.
      await expect((await actions()).markNotificationAsRead(100)).rejects.toThrow(
        'Not the resource owner'
      );
    });

    it('allows marking the caller\'s own notification as read', async () => {
      await seedNotification(101, 7);
      await auth.signInAs({ userId: 7, roles: ['citizen'] });

      await expect((await actions()).markNotificationAsRead(101)).resolves.toBeUndefined();
    });

    it('allows an admin to mark another user\'s notification as read', async () => {
      await seedNotification(102, 8);
      await auth.signInAs({ userId: 7, roles: ['admin'] });

      await expect((await actions()).markNotificationAsRead(102)).resolves.toBeUndefined();
    });

    it('does not leak whether a notification exists to a non-owner', async () => {
      // A missing id is a silent no-op, so a non-owner cannot distinguish
      // "not yours" from "does not exist" by probing ids.
      await auth.signInAs({ userId: 7, roles: ['citizen'] });

      await expect((await actions()).markNotificationAsRead(999_999)).resolves.toBeUndefined();
    });
  });

  describe('the notification list is scoped to the session user', () => {
    it('returns only the caller\'s notifications', async () => {
      await seedNotification(200, 7);
      await seedNotification(201, 8);
      await auth.signInAs({ userId: 7, roles: ['citizen'] });

      const mine = await (await actions()).getUnreadNotifications();

      expect(mine.map((n) => n.id)).toEqual([200]);
    });
  });
});
