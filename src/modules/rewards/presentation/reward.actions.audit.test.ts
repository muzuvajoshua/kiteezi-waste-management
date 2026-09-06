import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authHarness } from '@/modules/auth/presentation/action-auth.test-support';
import type { InMemoryAuditLogger } from '@/shared/infrastructure/audit/in-memory-audit-logger.adapter';

// KWM-078 — the points mint is the highest-privilege operation in this
// system: one account granting value to another. If anything is audited, it
// is this.

vi.mock('@/shared/presentation/composition', async () => {
  const { buildSharedComposition } = await import(
    '@/modules/auth/presentation/action-auth.test-support'
  );
  return buildSharedComposition();
});

vi.mock('@/modules/auth/presentation/composition', async () => {
  const { buildAuthComposition } = await import(
    '@/modules/auth/presentation/action-auth.test-support'
  );
  return buildAuthComposition();
});

const auth = authHarness();

vi.mock('./composition', async () => {
  const { InMemoryRewardRepository } = await import(
    '../infrastructure/in-memory-reward-repository.adapter'
  );
  const { InMemoryRewardCatalogRepository } = await import(
    '../infrastructure/in-memory-reward-catalog-repository.adapter'
  );
  const { InMemoryRewardTransactionManager } = await import(
    '../infrastructure/in-memory-reward-ledger-unit-of-work.adapter'
  );
  return {
    rewardRepository: new InMemoryRewardRepository(),
    rewardCatalogRepository: new InMemoryRewardCatalogRepository(),
    rewardTransactionManager: new InMemoryRewardTransactionManager(),
  };
});

async function auditLog(): Promise<InMemoryAuditLogger> {
  const shared = (await import('@/shared/presentation/composition')) as unknown as {
    auditLogger: InMemoryAuditLogger;
  };
  return shared.auditLogger;
}

const actions = () => import('./reward.actions');

beforeEach(async () => {
  await auth.reset();
  (await auditLog()).clear();
});

describe('reward action auditing', () => {
  describe('granting points', () => {
    it('records the granter, the recipient and the amount', async () => {
      await auth.signInAs({ userId: 8, roles: ['operator'] });

      await (await actions()).saveReward(2, 50);

      expect((await auditLog()).find('reward.points.granted')).toMatchObject({
        actorUserId: 8,
        target: 'user:2',
        after: { amount: 50 },
      });
    });

    it('names the RECIPIENT as the target, not the actor', async () => {
      // "Who received value" is the question this trail exists to answer.
      await auth.signInAs({ userId: 8, roles: ['operator'] });

      await (await actions()).saveReward(77, 25);

      expect((await auditLog()).find('reward.points.granted')?.target).toBe('user:77');
    });

    it('records nothing when a citizen is refused', async () => {
      await auth.signInAs({ userId: 3, roles: ['citizen'] });

      await (await actions()).saveReward(2, 1_000_000);

      expect((await auditLog()).entries).toHaveLength(0);
    });

    it('does not record a second entry for an idempotent replay', async () => {
      // The same key applies once. Two entries would read as two grants and
      // overstate what happened.
      await auth.signInAs({ userId: 8, roles: ['operator'] });
      await (await actions()).saveReward(2, 50, 'grant-key-1');

      await (await actions()).saveReward(2, 50, 'grant-key-1');

      expect(
        (await auditLog()).entries.filter((e) => e.action === 'reward.points.granted')
      ).toHaveLength(1);
    });
  });

  describe('redeeming', () => {
    it('records the redemption against the redeeming user', async () => {
      await auth.signInAs({ userId: 5, roles: ['citizen'] });

      await (await actions()).redeemReward(0);

      expect((await auditLog()).find('reward.redeemed')).toMatchObject({
        actorUserId: 5,
        target: 'user:5',
      });
    });
  });
});
