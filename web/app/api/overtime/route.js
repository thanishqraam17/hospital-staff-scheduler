// POST /api/overtime  (Admin) - log overtime on a worked shift.
// The overtime_rescore TRIGGER recalculates that week's burnout score.
import { api, fail } from '@/lib/api';

export const POST = api('Admin', async ({ db, body }) => {
  const [shiftId, staffId] = String(body.assignment || '').split(':');
  if (!shiftId || !staffId) fail('Pick a shift.');

  await db.query(
    'INSERT INTO overtime_log (staff_id, shift_id, hours) VALUES ($1::int, $2::int, $3::numeric)',
    [staffId, shiftId, body.hours]
  );
  const { rows } = await db.query(
    `SELECT b.score, b.risk_level, s.full_name
     FROM burnout_score b
     JOIN staff s ON s.staff_id = b.staff_id
     JOIN shift sh ON sh.shift_id = $2::int
     WHERE b.staff_id = $1::int AND b.week_start = date_trunc('week', sh.shift_date)::date`,
    [staffId, shiftId]
  );
  const r = rows[0];
  return {
    message: r
      ? `Logged. ${r.full_name}'s burnout score for that week is now ${r.score} (${r.risk_level}), recalculated by trigger.`
      : 'Logged.',
  };
});
