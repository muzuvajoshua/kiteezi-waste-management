import { db } from '@/utils/db/dbConfig';
import { DrizzleCollectedWasteRepository } from '../infrastructure/drizzle-collected-waste-repository.adapter';

// KWM-063 moved the connection here from inside the adapter. The composition
// root is the only place that should know which database this process talks
// to; the adapter now only knows it talks to Postgres.
export const collectedWasteRepository = new DrizzleCollectedWasteRepository(db);
