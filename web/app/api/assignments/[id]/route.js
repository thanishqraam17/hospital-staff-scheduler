// DELETE /api/assignments/:id  (Admin) - cancel an assignment (kept for history)
import { api, fail } from '@/lib/api';

export const DELETE = api('Admin', async ({ db, params }) => {
  const { rowCount } = await db.query(
    "UPDATE shift_assignment SET status = 'Cancelled' WHERE assignment_id = $1::int",
    [params.id]
  );
  if (!rowCount) fail('Assignment not found.');
  return { message: 'Assignment cancelled.' };
});
