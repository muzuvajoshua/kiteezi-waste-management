import { describe, it, expect } from 'vitest';
import { markNotificationReadSchema } from './notification.schemas';

describe('markNotificationReadSchema', () => {
  it('accepts a positive id', () => {
    expect(markNotificationReadSchema.safeParse({ notificationId: 9 }).success).toBe(true);
  });
  it('rejects a non-positive id', () => {
    expect(markNotificationReadSchema.safeParse({ notificationId: -3 }).success).toBe(false);
    expect(markNotificationReadSchema.safeParse({ notificationId: 0 }).success).toBe(false);
  });
});
