// PATCH /api/leaves/:id  (Admin) - approve or reject.
// Approving fires the cancel_on_leave TRIGGER, which cancels that person's
// shifts inside the leave period.
import { api, fail } from '@/lib/api';

export const PATCH = api('Admin', async ({ db, body, params }) => {
  if (!['Approved', 'Rejected'].includes(body.status)) fail('Status must be Approved or Rejected.');

  const { rows } = await db.query(
    `UPDATE leave_request SET status = $1
     WHERE leave_id = $2::int AND status = 'Pending'
     RETURNING staff_id, start_date, end_date`,
    [body.status, params.id]
  );
  if (!rows.length) fail('This request is not pending any more.');

  if (body.status === 'Rejected') return { message: 'Leave rejected.' };

  const { rows: cancelled } = await db.query(
    `SELECT COUNT(*)::int AS n FROM shift_assignment a
     JOIN shift sh ON sh.shift_id = a.shift_id
     WHERE a.staff_id = $1 AND a.status = 'Cancelled'
       AND sh.shift_date BETWEEN $2 AND $3`,
    [rows[0].staff_id, rows[0].start_date, rows[0].end_date]
  );
  return { message: `Approved. ${cancelled[0].n} shift(s) in that period are now cancelled (trigger).` };
});
