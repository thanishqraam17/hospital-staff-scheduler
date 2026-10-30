// POST /api/assignments/swap  (Admin) - swap two people's shifts.
// swap_shift() runs inside one TRANSACTION: if the trigger rejects either side,
// nothing changes.
import { api, fail } from '@/lib/api';

export const POST = api('Admin', async ({ db, body }) => {
  if (!body.a || !body.b || body.a === body.b) fail('Pick two different assignments.');
  await db.query('CALL swap_shift($1::int, $2::int)', [body.a, body.b]);
  return { message: 'Swapped. Both people passed the rest and workload rules.' };
});
