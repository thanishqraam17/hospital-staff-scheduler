// Admin dashboard: weekly burnout scores (stored function + procedure),
// department summary (GROUP BY) and the high_risk_staff VIEW.
import { withRole, rows } from '@/lib/db.mjs';
import { requireRole } from '@/lib/session';
import { Header, Section, Tag, Meter, Empty, Filters } from '@/components/ui';
import ApiForm from '@/components/ApiForm';

export default async function AdminHome({ searchParams }) {
  const session = await requireRole('Admin');
  const sp = await searchParams;

  const data = await withRole(session, async (db) => {
    const weeks = await rows(db, `
      SELECT week_start, MAX(score) AS top
      FROM burnout_score GROUP BY week_start ORDER BY week_start DESC`);
    const fallback = weeks.find((w) => Number(w.top) > 0) ?? weeks[0];
    const week = sp.week ?? fallback?.week_start ?? null;

    const [figures] = await rows(db, `
      SELECT (SELECT COUNT(*) FROM staff) AS staff,
             (SELECT COUNT(*) FROM leave_request WHERE status = 'Pending') AS pending,
             (SELECT COUNT(*) FROM burnout_score WHERE week_start = $1 AND risk_level = 'High') AS high,
             (SELECT COUNT(*) FROM burnout_score WHERE week_start = $1 AND risk_level = 'Medium') AS medium,
             (SELECT ROUND(AVG(score)) FROM burnout_score WHERE week_start = $1) AS avg_score`, [week]);

    const scores = await rows(db, `
      SELECT s.full_name, s.role_title, d.name AS department, b.total_hours, b.night_shifts,
             b.max_consecutive_days, b.overtime_hours, b.score, b.risk_level
      FROM burnout_score b
      JOIN staff s ON s.staff_id = b.staff_id
      JOIN department d ON d.department_id = s.department_id
      WHERE b.week_start = $1
      ORDER BY b.score DESC, s.full_name`, [week]);

    const departments = await rows(db, `
      SELECT d.name, ROUND(AVG(b.score), 1) AS avg_score, SUM(b.total_hours) AS hours,
             SUM(b.overtime_hours) AS overtime,
             COUNT(*) FILTER (WHERE b.risk_level <> 'Low') AS at_risk
      FROM burnout_score b
      JOIN staff s ON s.staff_id = b.staff_id
      JOIN department d ON d.department_id = s.department_id
      WHERE b.week_start = $1
      GROUP BY d.name
      ORDER BY avg_score DESC`, [week]);

    const history = await rows(db, `
      SELECT full_name, department, week_start, score
      FROM high_risk_staff ORDER BY week_start DESC, score DESC`);

    return { weeks, week, figures, scores, departments, history };
  });

  const { weeks, week, figures, scores, departments, history } = data;

  return (
    <>
      <Header kicker="Scheduler desk" title="Burnout watch">
        Weekly score from hours above 40, night shifts, consecutive days and overtime.
        Low below 30, Medium 30 to 59, High 60 and above.
      </Header>

      <div className="figures">
        <div className="figure"><b>{figures.staff}</b><span>staff on record</span></div>
        <div className="figure alert"><b>{figures.high}</b><span>high risk this week</span></div>
        <div className="figure"><b>{figures.medium}</b><span>medium risk</span></div>
        <div className="figure"><b>{figures.avg_score ?? '–'}</b><span>average score</span></div>
        <div className="figure"><b>{figures.pending}</b><span>leave requests pending</span></div>
      </div>

      <Section title="Scores by person" note={week ? `week of ${week}` : ''}>
        <Filters
          base="/admin"
          name="week"
          value={week}
          options={weeks.map((w) => [w.week_start, w.week_start])}
        />
        {scores.length === 0 ? (
          <Empty>No scores for this week yet.</Empty>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Name</th><th>Department</th><th className="num">Hours</th>
                <th className="num">Nights</th><th className="num">Days in a row</th>
                <th className="num">Overtime</th><th>Score</th><th className="num"></th><th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((r) => (
                <tr key={r.full_name}>
                  <td>{r.full_name} <span className="dim">· {r.role_title}</span></td>
                  <td>{r.department}</td>
                  <td className="num">{r.total_hours}</td>
                  <td className="num">{r.night_shifts}</td>
                  <td className="num">{r.max_consecutive_days}</td>
                  <td className="num">{r.overtime_hours}</td>
                  <td><Meter score={r.score} level={r.risk_level} /></td>
                  <td className="num">{r.score}</td>
                  <td><Tag value={r.risk_level} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="panel">
          <h3>Recalculate</h3>
          <ApiForm to="/api/burnout/refresh" submit="Recalculate this week" reset={false}>
            <input type="hidden" name="week" value={week ?? ''} />
            <span className="dim">Runs the refresh_burnout_scores() procedure for every staff member.</span>
          </ApiForm>
        </div>
      </Section>

      <Section title="By department" note="same week">
        <table className="ledger">
          <thead>
            <tr><th>Department</th><th className="num">Average score</th><th className="num">Hours</th>
              <th className="num">Overtime</th><th className="num">Medium / High</th></tr>
          </thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.name}>
                <td>{d.name}</td><td className="num">{d.avg_score}</td><td className="num">{d.hours}</td>
                <td className="num">{d.overtime}</td><td className="num">{d.at_risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="High-risk history" note="from the high_risk_staff view">
        {history.length === 0 ? (
          <Empty>Nobody has reached high risk.</Empty>
        ) : (
          <table className="ledger">
            <thead><tr><th>Week</th><th>Name</th><th>Department</th><th className="num">Score</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.full_name + h.week_start}>
                  <td className="mono">{h.week_start}</td><td>{h.full_name}</td>
                  <td>{h.department}</td><td className="num">{h.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
