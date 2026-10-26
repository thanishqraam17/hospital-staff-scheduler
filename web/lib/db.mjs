// Shared PostgreSQL connection pool.
// The connection string comes from the DATABASE_URL environment variable
// (.env.local) - credentials are never written in the code.
import pg from 'pg';

const { Pool } = pg;

// Reuse one pool across hot reloads in development
const globalForPg = globalThis;
export const pool =
  globalForPg._pgPool ??
  (globalForPg._pgPool = new Pool({ connectionString: process.env.DATABASE_URL }));
