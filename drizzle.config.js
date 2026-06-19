import 'dotenv/config';

/** @type {import('drizzle-kit').Config} */
export default {
  dialect: 'postgresql',
  schema: './utils/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    table: '__drizzle_migrations',
    schema: 'public',
  },
  strict: true,
  verbose: true,
};
