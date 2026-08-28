import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  authHarness,
  expectAdmitted,
  expectRefused,
} from '@/modules/auth/presentation/action-auth.test-support';

// Authorization enforcement at the ACTION boundary for the collection module.
// See report.actions.auth.test.ts for why the composition root is the seam.
//
// Every action here is collection-role only: a citizen must not be able to
// record a collection against a report, because recording one is what a
// collector gets credited for.

vi.mock('@/modules/auth/presentation/composition', async () => {
  const { buildAuthComposition } = await import(
    '@/modules/auth/presentation/action-auth.test-support'
  );
  return buildAuthComposition();
});

const auth = authHarness();

vi.mock('./composition', async () => {
  const { InMemoryCollectedWasteRepository } = await import(
    '../infrastructure/in-memory-collected-waste-repository.adapter'
  );
  return { collectedWasteRepository: new InMemoryCollectedWasteRepository() };
});

beforeEach(async () => {
  await auth.reset();
});

type Actions = typeof import('./collection.actions');

const ALL_ROLES = ['citizen', 'operator', 'supervisor', 'admin', 'dump_op'] as const;
const COLLECTION_ROLES = ['operator', 'supervisor', 'admin'] as const;

const ACTIONS = [
  {
    name: 'getCollectedWastesByCollector',
    call: (m: Actions) => m.getCollectedWastesByCollector(),
  },
  { name: 'createCollectedWaste', call: (m: Actions) => m.createCollectedWaste(1) },
  { name: 'saveCollectedWaste', call: (m: Actions) => m.saveCollectedWaste(1) },
] as const;

async function actions(): Promise<Actions> {
  return import('./collection.actions');
}

describe('collection.actions authorization', () => {
  describe('every action rejects an unauthenticated caller', () => {
    for (const { name, call } of ACTIONS) {
      it(`${name} throws UnauthenticatedError with no session`, async () => {
        await auth.signOut();
        await expectRefused(call(await actions()), 'UNAUTHENTICATED');
      });
    }
  });

  describe('every action rejects a caller without a collection role', () => {
    const denied = ALL_ROLES.filter(
      (role) => !(COLLECTION_ROLES as readonly string[]).includes(role)
    );

    for (const { name, call } of ACTIONS) {
      for (const role of denied) {
        it(`${name} throws ForbiddenError for a ${role}`, async () => {
          await auth.signInAs({ roles: [role] });
          await expectRefused(call(await actions()), 'FORBIDDEN');
        });
      }
    }
  });

  describe('every action admits every collection role', () => {
    for (const { name, call } of ACTIONS) {
      for (const role of COLLECTION_ROLES) {
        it(`${name} admits a ${role}`, async () => {
          await auth.signInAs({ roles: [role] });
          await expectAdmitted(call(await actions()));
        });
      }
    }
  });

  describe('the collector is the session user, never an argument', () => {
    it('records the collection against the signed-in collector', async () => {
      await auth.signInAs({ userId: 42, roles: ['operator'] });

      const created = await (await actions()).createCollectedWaste(9);

      expect(created).toMatchObject({ ok: true, value: { reportId: 9, collectorId: 42 } });
    });

    it('scopes the collector\'s own list to the session user', async () => {
      await auth.signInAs({ userId: 42, roles: ['operator'] });
      const mod = await actions();
      await mod.createCollectedWaste(9);

      await auth.signInAs({ userId: 43, roles: ['operator'] });

      expect(await mod.getCollectedWastesByCollector()).toEqual({ ok: true, value: [] });
    });
  });
});
