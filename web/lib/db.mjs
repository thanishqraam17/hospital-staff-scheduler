// PostgreSQL connection + role-based access.
// DATABASE_URL (in .env.local) logs in as hospital_app, which on its own can
// only call authenticate(). Every real query runs through withRole(), which
// switches to app_admin or app_staff for one transaction and tells the
// database which staff member is logged in, so Row Level Security applies.
import pg from 'pg';

const { Pool, types } = pg;

// return DATE columns as plain 'YYYY-MM-DD' strings (no timezone shifting)
types.setTypeParser(1082, (value) => value);

const globalForPg = globalThis;
export const pool =
  globalForPg._pgPool ??
  (globalForPg._pgPool = new Pool({ connectionString: process.env.DATABASE_URL }));

// session: { role: 'Admin' | 'Staff', staffId: number | null }
export async function withRole(session, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(session.role === 'Admin' ? 'SET LOCAL ROLE app_admin' : 'SET LOCAL ROLE app_staff');
    await client.query("SELECT set_config('app.staff_id', $1, true)", [
      session.staffId ? String(session.staffId) : '',
    ]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// small helper: run a query and return the rows
export async function rows(client, sql, params = []) {
  return (await client.query(sql, params)).rows;
}
