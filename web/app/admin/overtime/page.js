// Overtime: log extra hours on a worked shift (trigger re-scores burnout),
// recent entries, and totals per person (GROUP BY + HAVING).
import { withRole, rows } from '@/lib/db.mjs';
import { requireRole } from '@/lib/session';
import { Header, Section, Tag, Empty } from '@/components/ui';
import ApiForm from '@/components/ApiForm';

export default async function Overtime() {
  const session = await requireRole('Admin');

  const { recentShifts, entries, totals } = await withRole(session, async (db) => ({
    recentShifts: await rows(db, `
      SELECT a.shift_id, a.staff_id, s.full_name, d.name AS department, sh.shift_type,
             to_char(sh.shift_date, 'DD Mon') AS day
      FROM shift_assignment a
      JOIN shift sh ON sh.shift_id = a.shift_id
      JOIN staff s ON s.staff_id = a.staff_id
      JOIN department d ON d.department_id = sh.department_id
      WHERE a.status <> 'Cancelled'
        AND sh.shift_date > (SELECT MAX(shift_date) FROM shift WHERE shift_date <= CURRENT_DATE) - 7
        AND sh.shift_date <= CURRENT_DATE
      ORDER BY sh.shift_date DESC, d.department_id, sh.start_time`),
    entries: await rows(db, `
      SELECT o.overtime_id, s.full_name, d.name AS department, sh.shift_type,
             to_char(sh.shift_date, 'DD Mon') AS day, o.hours
      FROM overtime_log o
      JOIN staff s ON s.staff_id = o.staff_id
      JOIN shift sh ON sh.shift_id = o.shift_id
      JOIN department d ON d.department_id = s.department_id
      ORDER BY o.logged_at DESC, o.overtime_id DESC
      LIMIT 15`),
    totals: await rows(db, `
      SELECT s.full_name, d.name AS department, COUNT(*) AS entries, SUM(o.hours) AS hours
      FROM overtime_log o
      JOIN staff s ON s.staff_id = o.staff_id
      JOIN department d ON d.department_id = s.department_id
      GROUP BY s.full_name, d.name
      HAVING SUM(o.hours) >= 10
      ORDER BY hours DESC`),
  }));

  return (
    <>
      <Header kicker="Scheduler desk" title="Overtime">
        Logging overtime fires a trigger that recalculates that person&apos;s burnout score for the week.
      </Header>

      <div className="panel" style={{ marginTop: 26 }}>
        <h3>Log overtime</h3>
        <ApiForm to="/api/overtime" submit="Log hours">
          <div className="field grow">
            <label>Shift worked (last 7 days)</label>
            <select name="assignment" required>
              {recentShifts.map((r) => (
                <option key={`${r.shift_id}:${r.staff_id}`} value={`${r.shift_id}:${r.staff_id}`}>
                  {r.day} · {r.shift_type} · {r.department} · {r.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Extra hours</label>
            <input type="number" name="hours" step="0.5" min="0.5" max="12" defaultValue="2" required />
          </div>
        </ApiForm>
      </div>

      <Section title="Recent entries" note="latest 15">
        {entries.length === 0 ? <Empty>No overtime logged.</Empty> : (
          <table className="ledger">
            <thead><tr><th>Day</th><th>Shift</th><th>Name</th><th>Department</th><th className="num">Hours</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.overtime_id}>
                  <td className="mono">{e.day}</td><td><Tag value={e.shift_type} /></td>
                  <td>{e.full_name}</td><td>{e.department}</td><td className="num">{e.hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Heavy overtime" note="10 hours or more in total">
        {totals.length === 0 ? <Empty>Nobody above 10 hours.</Empty> : (
          <table className="ledger">
            <thead><tr><th>Name</th><th>Department</th><th className="num">Entries</th><th className="num">Total hours</th></tr></thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.full_name}>
                  <td>{t.full_name}</td><td>{t.department}</td>
                  <td className="num">{t.entries}</td><td className="num">{t.hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
