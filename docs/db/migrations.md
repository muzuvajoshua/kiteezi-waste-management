# Database migrations

**Status:** file-based Drizzle migrations (KWM-013). The previous `db:push`
workflow has been removed — schema changes are now generated, committed, and
applied as ordered SQL files under [`drizzle/`](../../drizzle).

## Workflow

1. Edit the schema in [`utils/db/schema.ts`](../../utils/db/schema.ts).
2. Generate a migration from the diff:
   ```bash
   npm run db:generate -- --name <short_description>
   ```
   This writes `drizzle/NNNN_<name>.sql` plus a matching snapshot under
   `drizzle/meta/`. **Review the generated SQL** before committing — `drizzle-kit`
   produces a naive draft for some operations (see "Hand-hardened migrations").
3. Apply pending migrations against the target database:
   ```bash
   npm run db:migrate
   ```
   `DATABASE_URL` is read from `.env` via `dotenv` (configured in
   `drizzle.config.js`, KWM-023), so no manual `export` is required.
4. Commit the schema change, the `drizzle/*.sql` file, and the `drizzle/meta/*`
   snapshot together.

Inspect the schema interactively with `npm run db:studio`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run db:generate` | Generate a migration from the current schema diff. |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL`. |
| `npm run db:studio` | Open Drizzle Studio. |

> `db:push` was intentionally removed. Do not reintroduce it — it bypasses the
> migration history and is unsafe against databases with real data.

## Migration history

| File | Issue | Notes |
|---|---|---|
| `0000_baseline.sql` | KWM-013 | Captures the pre-existing schema. Uses `CREATE TABLE IF NOT EXISTS` + guarded FK constraints, so it is safe to replay against the already-provisioned database. |
| `0001_add_indexes.sql` | KWM-014 | Btree indexes on hot query paths (`CREATE INDEX IF NOT EXISTS`). |
| `0002_convert_enums.sql` | KWM-015 | Converts free-text status/type columns to Postgres enums. **Hand-hardened** (see below). |
| `0003_add_audit_log.sql` | KWM-016 | `audit_log` table + `(actor_user_id, created_at)` index. |

## Hand-hardened migrations

`0002_convert_enums.sql` was edited after generation because the `drizzle-kit`
draft emitted bare `ALTER COLUMN ... SET DATA TYPE <enum>` statements, which:

- fail without an explicit `USING` cast (Postgres will not implicitly cast
  `varchar` → `enum`);
- do not drop/restore column defaults (`reports.status`, `collected_wastes.status`);
- do not normalise legacy free-text values (notably `reports.waste_type`, which
  held arbitrary user input), so the cast would error on real rows.

The committed version drops defaults first, normalises legacy values to a valid
member (unmapped `waste_type` → `other`, unmapped statuses → their default),
casts with `USING`, then restores defaults. The end state is identical to
`drizzle/meta/0002_snapshot.json`.

When hand-editing a migration, keep each statement separated by
`--> statement-breakpoint` and ensure the final column types still match the
generated snapshot.

## Applying to staging / production

These migrations have been validated locally (`drizzle-kit check` passes, schema
round-trips with no drift) but have **not** been applied to a live database from
this branch. Apply them staging-first against a Neon branch, verify, then
promote. The enum conversion (`0002`) is the only data-touching migration; review
its normalisation rules against actual `reports.waste_type` values before running.

## Audit log retention (KWM-016)

`audit_log` is append-only. Default retention is **1 year**; entries older than
that may be pruned by a scheduled job (to be implemented with the background-job
runtime, KWM-058). Until then the table grows unbounded — monitor its size.
