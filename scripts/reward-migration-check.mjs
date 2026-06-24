/**
 * KWM-011 — synthetic-data validation for the 0005 reward-ledger migration.
 *
 * The production DB is empty, so a real `db:migrate` proves nothing. This script
 * reconstructs the ledger + balance from synthetic legacy `transactions` using
 * the SAME logic as drizzle/0005_reward_ledger.sql and asserts:
 *   - reconstruction values (50-earn user, normal user, no-txn user)
 *   - the invariant  SUM(point_transactions.amount) == user_reward_balance.points
 *     (after reconstruction AND after each simulated mint/redeem)
 *   - re-run idempotency (ON CONFLICT no-ops)
 *   - fail-loud detection of a negative reconstructed balance
 *
 * Everything runs inside ONE transaction on a single pooled connection, using
 * TEMP tables (so it touches no real data and needs no migration applied). The
 * single transaction is required because the DATABASE_URL is the Neon pooler
 * endpoint (PgBouncer transaction pooling) — TEMP tables only persist within a
 * transaction there. TEXT is used for `kind` (the enum is irrelevant to the math).
 *
 * Run:  node scripts/reward-migration-check.mjs
 */
import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

let ok = true;
const check = (label, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${label}${detail !== undefined ? ' | ' + detail : ''}`);
  if (!cond) ok = false;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
const q = async (text, params) => (await client.query(text, params)).rows;

const backfill = `
  INSERT INTO pt (user_id, kind, amount, idempotency_key)
  SELECT user_id,
    CASE type WHEN 'earned_report' THEN 'earn_report' WHEN 'earned_collect' THEN 'earn_collect' WHEN 'redeemed' THEN 'redeem' END,
    CASE WHEN type='redeemed' THEN -amount ELSE amount END,
    'legacy:txn:'||id
  FROM legacy_txns
  ON CONFLICT (idempotency_key) DO NOTHING`;
const setBalance = `
  INSERT INTO urb (user_id, points) SELECT user_id, SUM(amount) FROM pt GROUP BY user_id
  ON CONFLICT (user_id) DO UPDATE SET points = EXCLUDED.points`;

try {
  await client.query('BEGIN'); // single transaction → TEMP tables persist through the pooler
  await client.query(`CREATE TEMP TABLE legacy_txns (id serial PRIMARY KEY, user_id int, type text, amount int)`);
  await client.query(`CREATE TEMP TABLE pt (id serial PRIMARY KEY, user_id int, kind text, amount int, idempotency_key text UNIQUE, created_at timestamptz DEFAULT now())`);
  await client.query(`CREATE TEMP TABLE urb (user_id int PRIMARY KEY, points int)`);

  // Seed: A=1 (50 earns + 3 redeems → 320), B=2 (100−40 → 60), D=4 (no txns → 0)
  for (let i = 0; i < 50; i++) await client.query(`INSERT INTO legacy_txns (user_id,type,amount) VALUES (1,'earned_report',10)`);
  for (const a of [100, 50, 30]) await client.query(`INSERT INTO legacy_txns (user_id,type,amount) VALUES (1,'redeemed',$1)`, [a]);
  await client.query(`INSERT INTO legacy_txns (user_id,type,amount) VALUES (2,'earned_report',100),(2,'redeemed',40)`);

  // Step 1: zero-balance row per user.
  await client.query(`INSERT INTO urb (user_id,points) VALUES (1,0),(2,0),(4,0) ON CONFLICT (user_id) DO NOTHING`);
  // Step 2: backfill signed ledger.
  await client.query(backfill);
  // Step 3: negative guard (success case → 0).
  const neg1 = (await q(`SELECT count(*)::int n FROM (SELECT user_id FROM pt GROUP BY user_id HAVING SUM(amount)<0) s`))[0].n;
  check('negative guard finds 0 for A,B,D', neg1 === 0, `n=${neg1}`);
  // Step 4: exact balance (no clamp).
  await client.query(setBalance);

  const bal = Object.fromEntries((await q(`SELECT user_id, points FROM urb`)).map(r => [r.user_id, Number(r.points)]));
  check('A (50 earns − 180 redeemed) == 320', bal[1] === 320, `A=${bal[1]}`);
  check('B (100 − 40) == 60', bal[2] === 60, `B=${bal[2]}`);
  check('D (no transactions) == 0', bal[4] === 0, `D=${bal[4]}`);

  const invariant = async (label) => {
    const rows = await q(`SELECT u.user_id, u.points::int points, COALESCE((SELECT SUM(amount) FROM pt WHERE pt.user_id=u.user_id),0)::int ledger FROM urb u`);
    const holds = rows.every(r => Number(r.points) === Number(r.ledger));
    check(`invariant SUM(ledger)==balance ${label}`, holds, JSON.stringify(rows));
  };
  await invariant('after reconstruction');

  // Re-run idempotency: backfill again, ledger row count must not change.
  const beforeRerun = (await q(`SELECT count(*)::int n FROM pt`))[0].n;
  await client.query(backfill);
  await client.query(setBalance);
  const afterRerun = (await q(`SELECT count(*)::int n FROM pt`))[0].n;
  check('re-run idempotent: ledger row count unchanged', beforeRerun === afterRerun, `before=${beforeRerun} after=${afterRerun}`);
  await invariant('after re-run');

  // Per-operation invariant: mint +25 then redeem −45 on user A.
  await client.query(`INSERT INTO pt (user_id,kind,amount) VALUES (1,'earn_collect',25)`);
  await client.query(`INSERT INTO urb (user_id,points) VALUES (1,25) ON CONFLICT (user_id) DO UPDATE SET points = urb.points + 25`);
  check('A after mint +25 == 345', Number((await q(`SELECT points FROM urb WHERE user_id=1`))[0].points) === 345);
  await invariant('after mint');
  await client.query(`INSERT INTO pt (user_id,kind,amount) VALUES (1,'redeem',-45)`);
  await client.query(`UPDATE urb SET points = points - 45 WHERE user_id=1`);
  check('A after redeem -45 == 300', Number((await q(`SELECT points FROM urb WHERE user_id=1`))[0].points) === 300);
  await invariant('after redeem');

  // Fail-loud: user C=3 reconstructs negative (+20 −50).
  await client.query(`INSERT INTO legacy_txns (user_id,type,amount) VALUES (3,'earned_report',20),(3,'redeemed',50)`);
  await client.query(backfill);
  const neg2 = (await q(`SELECT count(*)::int n FROM (SELECT user_id FROM pt GROUP BY user_id HAVING SUM(amount)<0) s`))[0].n;
  check('fail-loud guard detects negative user C (would RAISE/rollback)', neg2 === 1, `negatives=${neg2}`);

  await client.query('ROLLBACK');
  console.log(ok ? 'MIGRATION_CHECK_OK' : 'MIGRATION_CHECK_FAIL');
} catch (e) {
  try { await client.query('ROLLBACK'); } catch { /* ignore */ }
  console.error('MIGRATION_CHECK_ERROR:', e.message);
  ok = false;
} finally {
  client.release();
  await pool.end();
}
process.exit(ok ? 0 : 1);
