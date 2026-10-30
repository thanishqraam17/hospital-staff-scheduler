// POST /api/assignments  (Admin) - put a staff member on a shift.
// The validate_assignment TRIGGER rejects double booking, < 11 h rest,
// approved leave and the weekly hour cap; its message is shown in the UI.
import { api } from '@/lib/api';

export const POST = api('Admin', async ({ db, body }) => {
  await db.query(
    `INSERT INTO shift_assignment (shift_id, staff_id)
     VALUES ($1::int, $2::int)
     ON CONFLICT (shift_id, staff_id) DO UPDATE SET status = 'Assigned'`,
    [body.shift_id, body.staff_id]
  );
  return { message: 'Assigned. All rest and workload rules passed.' };
});
