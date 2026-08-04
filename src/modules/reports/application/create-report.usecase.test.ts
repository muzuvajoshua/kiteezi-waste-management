import { describe, it, expect } from 'vitest';
import { InMemoryReportTransactionManager } from '../infrastructure/in-memory-report-write-unit-of-work.adapter';
import { InMemoryNotificationRepository } from '@/modules/notifications/infrastructure/in-memory-notification-repository.adapter';
import { createReport } from './create-report.usecase';

function setup() {
  return {
    txManager: new InMemoryReportTransactionManager(),
    notificationRepository: new InMemoryNotificationRepository(),
  };
}

describe('createReport', () => {
  it('inserts the report, mints 10 points, and sends a notification', async () => {
    const { txManager, notificationRepository } = setup();

    const result = await createReport(txManager, notificationRepository, {
      userId: 7,
      location: 'Kiteezi zone 4',
      wasteType: 'plastic',
      amount: '12',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ userId: 7, location: 'Kiteezi zone 4', status: 'pending' });
    }
    expect(txManager.rewardTransactionManager.balances.get(7)).toBe(10);
    expect(txManager.rewardTransactionManager.transactions[0]).toMatchObject({
      kind: 'earn_report',
      amount: 10,
      relatedReportId: result.ok ? result.value.id : undefined,
    });
    expect(await notificationRepository.findUnreadByUserId(7)).toHaveLength(1);
  });

  it('does not fail the report when the notification send fails', async () => {
    const { txManager } = setup();
    const brokenNotificationRepository = {
      findUnreadByUserId: async () => [],
      findById: async () => null,
      markRead: async () => {},
      create: async () => {
        throw new Error('notification service down');
      },
    };

    const result = await createReport(txManager, brokenNotificationRepository, {
      userId: 7,
      location: 'Zone 1',
      wasteType: 'general',
      amount: '5',
    });

    expect(result.ok).toBe(true); // report still succeeds
    expect(txManager.rewardTransactionManager.balances.get(7)).toBe(10); // points still minted
  });
});
