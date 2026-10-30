// POST /api/shifts  (Admin) - open Morning/Evening/Night shifts for every department on a date
import { api } from '@/lib/api';

export const POST = api('Admin', async ({ db, body }) => {
  const { rowCount } = await db.query(
    `INSERT INTO shift (department_id, shift_date, shift_type, start_time, end_time)
     SELECT d.department_id, $1::date, t.shift_type,
            $1::date + t.start_offset, $1::date + t.start_offset + INTERVAL '8 hours'
     FROM department d
     CROSS JOIN (VALUES ('Morning', INTERVAL '7 hours'),
                        ('Evening', INTERVAL '15 hours'),
                        ('Night',   INTERVAL '23 hours')) AS t(shift_type, start_offset)
     ON CONFLICT (department_id, shift_date, shift_type) DO NOTHING`,
    [body.date]
  );
  return {
    message: rowCount ? `${rowCount} shifts opened for ${body.date}.` : 'Shifts for that date already exist.',
    redirect: `/admin/roster?date=${body.date}`,
  };
});
