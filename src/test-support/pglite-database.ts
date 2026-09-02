import path from 'node:path';
import { sql } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/utils/db/schema';
import type { Database } from '@/shared/infrastructure/persistence/database';

// KWM-063 — a real Postgres for the Drizzle adapter contract runs.
//
// PGlite is Postgres itself compiled to WebAssembly, running in this process.
// It is a devDependency and is never imported by application code: nothing
// here ships. The alternatives were a per-run Neon branch (needs an API key
// in CI) or the project's own Neon database (which holds production data —
// contract tests delete rows, so the blast radius was unacceptable).
//
// What it buys over the in-memory fakes is everything the fakes cannot model:
// the actual SQL each adapter emits, real enum and CHECK constraints, foreign
// keys, ON CONFLICT, generated identity columns, timestamp round-tripping and
// genuine BEGIN/COMMIT. Those are exactly the behaviours a hand-written fake
// gets subtly wrong.
//
// It is not a perfect stand-in for Neon: no pooler, no cold starts, no
// network. Those belong to a deployment test, not an adapter contract.

// The migration folder, not the Drizzle schema. `migrate()` replays the same
// 10 SQL files that ran against the live database, so a migration that drifts
// from schema.ts fails here rather than in production — the class of bug that
// produced the 0006/0007 duplicate CHECK.
const MIGRATIONS = path.join(process.cwd(), 'drizzle');

// Ordered children-first so a plain TRUNCATE would work even without CASCADE;
// CASCADE is still passed because it is the truncation that must not fail.
// Listed explicitly rather than discovered from information_schema: a new
// table added without a line here leaves rows behind between tests, and the
// assertion below turns that silent leak into a failure.
const TABLES = [
  'audit_log',
  'point_transactions',
  'user_reward_balance',
  'reward_catalog',
  'transactions',
  'rewards',
  'collected_wastes',
  'notifications',
  'reports',
  'sessions',
  'password_reset_tokens',
  'user_identities',
  'user_roles',
  'roles',
  'rate_limit_counters',
  'users',
] as const;

export interface TestDatabase {
  readonly db: Database;
  /** Empties every table and restarts identity sequences. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Boots an empty, fully migrated Postgres.
 *
 * Migrating costs a second or so, so call this once per test file in a
 * `beforeAll` and call `reset()` in `beforeEach` rather than creating one per
 * test.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: MIGRATIONS });
  await assertEveryTableIsTruncatable(client);

  return {
    db,
    reset: () => truncateAll(db),
    close: () => client.close(),
  };
}

/**
 * Inserts users 1..count.
 *
 * Nearly every other table carries a foreign key to `users`, which the
 * in-memory fakes do not model — so a contract written against a fake freely
 * references user ids that were never created. Seeding a block of them up
 * front keeps those runs about the adapter rather than about fixtures. The
 * default covers the largest id any current contract uses (42).
 */
export async function seedUsers(db: Database, count = 50): Promise<void> {
  await db.insert(schema.Users).values(
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      email: `user${i + 1}@example.com`,
      name: `User ${i + 1}`,
    }))
  );
  // An explicit id does not advance the serial sequence, so a later insert
  // that lets the database assign one would collide on id 1.
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users))`
  );
}

async function truncateAll(db: Database): Promise<void> {
  // One statement, so it is atomic and the FK graph is irrelevant. RESTART
  // IDENTITY matters: several contract assertions compare generated ids, and
  // ids that keep climbing across tests make those assertions order-dependent.
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`)
  );
}

// A table created by a later migration and not added to TABLES would silently
// keep its rows between tests, and the failure would surface far away as a
// duplicate-key error in an unrelated suite. Checked once at boot instead.
// Queried through the raw PGlite client rather than `db.execute`: `Database`
// is the driver-agnostic `PgDatabase`, whose result type is an unresolved HKT,
// so a generic `execute<T>` on it yields `unknown`. The client is concrete
// here and correctly typed.
async function assertEveryTableIsTruncatable(client: PGlite): Promise<void> {
  const result = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  const live = result.rows
    .map((r) => r.tablename)
    .filter((t) => t !== '__drizzle_migrations');
  const missing = live.filter((t) => !TABLES.includes(t as (typeof TABLES)[number]));

  if (missing.length > 0) {
    throw new Error(
      `pglite-database.ts TABLES is missing: ${missing.join(', ')}. ` +
        'Add them so reset() actually empties the database between tests.'
    );
  }
}
