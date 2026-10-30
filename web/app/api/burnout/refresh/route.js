// POST /api/burnout/refresh  (Admin) - recompute every score for a week
// using the refresh_burnout_scores() stored procedure.
import { api } from '@/lib/api';

export const POST = api('Admin', async ({ db, body }) => {
  await db.query("CALL refresh_burnout_scores(date_trunc('week', $1::date)::date)", [body.week]);
  return { message: 'Burnout scores recalculated for that week.' };
});
