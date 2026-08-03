import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from './schema';

// KWM-018 — dedicated transactional client (Option B, dual-client).
//
// The neon-http client (utils/db/dbConfig.ts) cannot run interactive
// transactions — it throws "No transactions support in neon-http driver". Reads
// and simple writes stay on that http client; only the multi-write reward flows
// (createReport, saveReward, redeemReward) use this WebSocket Pool client, which
// supports real BEGIN/COMMIT/ROLLBACK and SELECT … FOR UPDATE.
//
// The Pool is lazy (no connection until the first query), so building/CI with a
// placeholder DATABASE_URL still works. The DATABASE_URL points at the Neon
// pooler endpoint, which supports transaction-scoped pooling for these flows.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

export const txdb = drizzle(pool, { schema });

// The transaction handle type, for typing helpers that run inside a transaction.
export type RewardTx = Parameters<Parameters<typeof txdb.transaction>[0]>[0];
