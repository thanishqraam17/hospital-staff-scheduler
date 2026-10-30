// Staff home: own burnout trend, own shifts, own overtime.
// Every query runs as app_staff, so Row Level Security returns only this person's rows.
import { withRole, rows } from '@/lib/db.mjs';
import { requireRole } from '@/lib/session';
import { Header, Section, Tag, Meter, Empty } from '@/components/ui';

const COLOURS = { Low: 'var(--low)', Medium: 'var(--medium)', High: 'var(--high)' };

export default async function MyWeek() {
  const session = await requireRole('Staff');

  const { me, scores, shifts, overtime } = await withRole(session, async (db) => ({
    me: (await rows(db, `
      SELECT s.full_name, s.role_title, s.max_weekly_hours, d.name AS department
      FROM staff s JOIN department d ON d.department_id = s.department_id`))[0],
    scores: await rows(db, `
      SELECT week_start, to_char(week_start, 'DD Mon') AS label, total_hours, night_shifts,
             max_consecutive_days, overtime_hours, score, risk_level
      FROM burnout_score ORDER BY week_start`),
    shifts: await rows(db, `
      SELECT to_char(sh.shift_date, 'Dy DD Mon') AS day, sh.shift_type,
             to_char(sh.start_time, 'HH24:MI') || '–' || to_char(sh.end_time, 'HH24:MI') AS hours,
             a.status
      FROM shift_assignment a JOIN shift sh ON sh.shift_id = a.shift_id
      ORDER BY sh.start_time DESC
      LIMIT 14`),
    overtime: (await rows(db, 'SELECT COALESCE(SUM(hours), 0) AS hours, COUNT(*) AS entries FROM overtime_log'))[0],
  }));

  const latest = [...scores].reverse().find((s) => Number(s.total_hours) > 0) ?? scores.at(-1);

  return (
    <>
      <Header kicker={`${me.role_title} · ${me.department}`} title={`Hello, ${me.full_name.split(' ')[0]}`}>
        Your hours, nights and overtime turn into a weekly burnout score. If it climbs,
        tell the scheduler or request leave.
      </Header>

      <div className="figures">
        <div className={`figure ${latest?.risk_level === 'High' ? 'alert' : ''}`}>
          <b>{latest?.score ?? '–'}</b><span>burnout score, week of {latest?.label ?? '–'}</span>
        </div>
        <div className="figure"><b>{latest?.total_hours ?? 0}</b><span>hours that week (cap {me.max_weekly_hours})</span></div>
        <div className="figure"><b>{latest?.night_shifts ?? 0}</b><span>night shifts that week</span></div>
        <div className="figure"><b>{overtime.hours}</b><span>overtime hours logged in total</span></div>
      </div>

      <Section title="Last weeks" note="score out of 100">
        {scores.length === 0 ? <Empty>No scores yet.</Empty> : (
          <div className="strip">
            {scores.map((s) => (
              <div key={s.week_start} className="wk">
                <span className="val">{s.score}</span>
                <div className="bar"><i style={{ height: `${Math.max(2, s.score)}%`, background: COLOURS[s.risk_level] }} /></div>
                {s.label}
              </div>
            ))}
          </div>
        )}
        {latest && (
          <p style={{ marginTop: 14 }}>
            <Meter score={latest.score} level={latest.risk_level} /> &nbsp;<Tag value={latest.risk_level} />
            <span className="dim"> &nbsp;{latest.max_consecutive_days} days in a row · {latest.overtime_hours} h overtime</span>
          </p>
        )}
      </Section>

      <Section title="My recent shifts" note="latest 14">
        {shifts.length === 0 ? <Empty>No shifts assigned.</Empty> : (
          <table className="ledger">
            <thead><tr><th>Day</th><th>Shift</th><th>Hours</th><th>Status</th></tr></thead>
            <tbody>
              {shifts.map((s, i) => (
                <tr key={i}>
                  <td className="mono">{s.day}</td><td><Tag value={s.shift_type} /></td>
                  <td className="mono">{s.hours}</td><td><Tag value={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
