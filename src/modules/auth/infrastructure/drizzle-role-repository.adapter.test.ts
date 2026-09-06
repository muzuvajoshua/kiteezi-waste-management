import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, seedUsers, type TestDatabase } from '@/test-support/pglite-database';
import { UserRoles } from '@/utils/db/schema';
import { DrizzleRoleRepository } from './drizzle-role-repository.adapter';

// KWM-063 — first coverage for this adapter.
//
// Every authorization decision in the application starts here: requireRole
// asks this repository what a user is, and an answer that is too generous
// admits a caller to something they should not reach. The `roles` catalog is
// seeded by migration 0004, so these runs also confirm that seed actually
// landed — a role name missing from it would make assignRole throw for
// everyone.

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  await database.reset();
  await seedUsers(database.db);
});

afterAll(async () => {
  await database.close();
});

const repo = () => new DrizzleRoleRepository(database.db);

describe('DrizzleRoleRepository', () => {
  it('reports no roles for a user who has none', async () => {
    // Not an empty-ish value that a guard might read as permissive.
    expect(await repo().getUserRoles(1)).toEqual([]);
  });

  it('round-trips an assigned role', async () => {
    await repo().assignRole(1, 'operator');

    expect(await repo().getUserRoles(1)).toEqual(['operator']);
  });

  it('returns every role a user holds', async () => {
    await repo().assignRole(1, 'operator');
    await repo().assignRole(1, 'supervisor');

    expect((await repo().getUserRoles(1)).sort()).toEqual(['operator', 'supervisor']);
  });

  it('returns only the named user\'s roles', async () => {
    // The join spans user_roles and roles; losing the user predicate would
    // hand every caller every granted role in the system.
    await repo().assignRole(1, 'admin');
    await repo().assignRole(2, 'citizen');

    expect(await repo().getUserRoles(2)).toEqual(['citizen']);
  });

  it('assigning the same role twice is a no-op, not a duplicate', async () => {
    await repo().assignRole(1, 'operator');
    await repo().assignRole(1, 'operator');

    expect(await repo().getUserRoles(1)).toEqual(['operator']);
  });

  it('records who granted the role', async () => {
    await repo().assignRole(1, 'operator', 9);

    const [row] = await database.db
      .select({ grantedBy: UserRoles.grantedBy })
      .from(UserRoles);
    expect(row.grantedBy).toBe(9);
  });

  it('leaves grantedBy null when nobody is named', async () => {
    await repo().assignRole(1, 'operator');

    const [row] = await database.db
      .select({ grantedBy: UserRoles.grantedBy })
      .from(UserRoles);
    expect(row.grantedBy).toBeNull();
  });

  it('refuses a role name that is not in the catalog', async () => {
    await expect(
      repo().assignRole(1, 'superuser' as unknown as 'admin')
    ).rejects.toThrow(/Unknown role: superuser/);
  });

  it('accepts every role the application knows about', async () => {
    // Confirms migration 0004's seed matches ROLE_NAMES. A name present in
    // the code but absent from the catalog would throw only at the moment
    // someone tried to grant it.
    for (const role of ['citizen', 'operator', 'supervisor', 'admin', 'dump_op'] as const) {
      await expect(repo().assignRole(1, role)).resolves.toBeUndefined();
    }

    expect((await repo().getUserRoles(1)).sort()).toEqual(
      ['admin', 'citizen', 'dump_op', 'operator', 'supervisor'].sort()
    );
  });

  it('refuses a grant to a user that does not exist', async () => {
    await expect(repo().assignRole(9999, 'operator')).rejects.toThrow(/foreign key|violates/i);
  });

  it('drops a user\'s grants when the user is deleted', async () => {
    await repo().assignRole(1, 'operator');

    await database.db.execute(sql`DELETE FROM users WHERE id = 1`);

    expect(await repo().getUserRoles(1)).toEqual([]);
  });
});
