import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  authHarness,
  expectAdmitted,
  expectRefused,
} from '@/modules/auth/presentation/action-auth.test-support';

// Authorization enforcement at the ACTION boundary for the rewards module.
// See report.actions.auth.test.ts for why the composition root is the seam.
//
// Rewards carry the highest-value privilege in the system: saveReward mints
// points onto another user's balance. An unguarded mint is a free-money bug,
// so the role boundary around it is asserted from both sides.

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

beforeEach(async () => {
  await auth.reset();
});

type Actions = typeof import('./reward.actions');

const ALL_ROLES = ['citizen', 'operator', 'supervisor', 'admin', 'dump_op'] as const;

const ACTIONS = [
  { name: 'getUserBalance', allowed: null, call: (m: Actions) => m.getUserBalance() },
  { name: 'getRewardTransactions', allowed: null, call: (m: Actions) => m.getRewardTransactions() },
  { name: 'getAvailableRewards', allowed: null, call: (m: Actions) => m.getAvailableRewards() },
  { name: 'redeemReward', allowed: null, call: (m: Actions) => m.redeemReward(0) },
  { name: 'saveReward', allowed: ['operator', 'supervisor', 'admin'], call: (m: Actions) => m.saveReward(2, 10) },
  { name: 'getAllRewards', allowed: ['supervisor', 'admin'], call: (m: Actions) => m.getAllRewards() },
] as const;

async function actions(): Promise<Actions> {
  return import('./reward.actions');
}

describe('reward.actions authorization', () => {
  describe('every action rejects an unauthenticated caller', () => {
    for (const { name, call } of ACTIONS) {
      it(`${name} throws UnauthenticatedError with no session`, async () => {
        await auth.signOut();
        await expectRefused(call(await actions()), 'UNAUTHENTICATED');
      });
    }
  });

  describe('role-restricted actions reject every role they do not name', () => {
    for (const { name, allowed, call } of ACTIONS) {
      if (allowed === null) continue;
      const denied = ALL_ROLES.filter((role) => !(allowed as readonly string[]).includes(role));

      for (const role of denied) {
        it(`${name} throws ForbiddenError for a ${role}`, async () => {
          await auth.signInAs({ roles: [role] });
          await expectRefused(call(await actions()), 'FORBIDDEN');
        });
      }
    }
  });

  describe('role-restricted actions admit every role they name', () => {
    for (const { name, allowed, call } of ACTIONS) {
      if (allowed === null) continue;

      for (const role of allowed) {
        it(`${name} admits a ${role}`, async () => {
          await auth.signInAs({ roles: [role] });
          await expectAdmitted(call(await actions()));
        });
      }
    }
  });

  describe('self-service actions admit a plain citizen', () => {
    for (const { name, allowed, call } of ACTIONS) {
      if (allowed !== null) continue;

      it(`${name} admits a citizen`, async () => {
        await auth.signInAs({ roles: ['citizen'] });
        await expectAdmitted(call(await actions()));
      });
    }
  });

  // saveReward is the mint. A citizen reaching it could award themselves
  // unlimited points, so its boundary is asserted explicitly rather than only
  // through the table above.
  describe('minting points is restricted to collection roles', () => {
    it('refuses a citizen trying to award points', async () => {
      await auth.signInAs({ userId: 1, roles: ['citizen'] });
      await expectRefused((await actions()).saveReward(1, 1_000_000), 'FORBIDDEN');
    });

    it('refuses a dump_op trying to award points', async () => {
      await auth.signInAs({ roles: ['dump_op'] });
      await expectRefused((await actions()).saveReward(2, 50), 'FORBIDDEN');
    });

    it('admits an operator', async () => {
      await auth.signInAs({ roles: ['operator'] });
      await expectAdmitted((await actions()).saveReward(2, 50));
    });
  });

  describe('oversight is stricter than collection', () => {
    it('an operator may mint but may not read every balance', async () => {
      await auth.signInAs({ roles: ['operator'] });
      const mod = await actions();

      await expectAdmitted(mod.saveReward(2, 10));
      await expectRefused(mod.getAllRewards(), 'FORBIDDEN');
    });

    it('a supervisor may do both', async () => {
      await auth.signInAs({ roles: ['supervisor'] });
      const mod = await actions();

      await expectAdmitted(mod.saveReward(2, 10));
      await expectAdmitted(mod.getAllRewards());
    });
  });

  describe('identity is taken from the session, never from an argument', () => {
    it('getUserBalance reads the session user\'s balance, not a supplied id', async () => {
      const { rewardRepository } = await import('./composition');
      const repo = rewardRepository as unknown as {
        seedBalance(userId: number, points: number): void;
      };
      repo.seedBalance(7, 250);
      repo.seedBalance(8, 999);

      await auth.signInAs({ userId: 7, roles: ['citizen'] });

      expect(await (await actions()).getUserBalance()).toEqual({ ok: true, value: 250 });
    });
  });
});
