import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type * as schema from '@/utils/db/schema';

// KWM-063 — the one type every Drizzle adapter is written against.
//
// Until now each adapter did `import { db } from '@/utils/db/dbConfig'`, which
// binds it to one connection decided at module load. That is why the Drizzle
// adapters had no tests: there was no way to point them at another database,
// so the five *-repository.contract.test.ts suites ran against the in-memory
// fakes only and the real implementations sat at 0% coverage. Injecting the
// handle is what makes the second run possible.
//
// Deliberately NOT `NeonHttpDatabase`. Three drivers are in play — neon-http
// (reads), neon-serverless Pool (transactions), and PGlite (tests) — and their
// concrete types differ in the query-result shape alone:
//
//   Type 'Results<…>' is not assignable to type 'NeonHttpQueryResult<unknown>'.
//     Property 'rowAsArray' is missing …
//
// That difference is in the raw driver result, which no adapter here reads;
// every one of them uses the query builder, `db.query.*`, or `.transaction()`.
// `PgDatabase` is the shared base all three extend, so naming it keeps the
// adapters honest about what they actually depend on: Postgres, not Neon.
export type Database = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

// The handle passed to a `.transaction()` callback. Adapters that run
// multi-statement writes take this rather than `Database`, so a helper meant
// to run inside a transaction cannot be handed the top-level client by
// mistake. Replaces `RewardTx` from utils/db/txClient.ts, which derived the
// same type from the concrete neon-serverless client.
export type DatabaseTx = PgTransaction<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
