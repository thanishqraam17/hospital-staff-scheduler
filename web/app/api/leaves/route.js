// POST /api/leaves  (Staff) - request leave for yourself.
// Row Level Security only allows a PENDING request for the logged-in staff member.
import { api } from '@/lib/api';

export const POST = api('Staff', async ({ db, body, session }) => {
  await db.query(
    `INSERT INTO leave_request (staff_id, start_date, end_date, reason)
     VALUES ($1, $2::date, $3::date, NULLIF($4, ''))`,
    [session.staffId, body.start_date, body.end_date, body.reason ?? '']
  );
  return { message: 'Leave requested. The scheduler will review it.' };
});
