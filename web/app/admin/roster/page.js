// Roster for one day: shifts per department, assign / cancel / swap,
// and open new shifts for a date. All rules are enforced by the database trigger.
import { withRole, rows } from '@/lib/db.mjs';
import { requireRole } from '@/lib/session';
import { Header, Section, Tag, Empty, Filters } from '@/components/ui';
import ApiForm from '@/components/ApiForm';
import ActionButton from '@/components/ActionButton';

const TYPES = ['Morning', 'Evening', 'Night'];

export default async function Roster({ searchParams }) {
  const session = await requireRole('Admin');
  const sp = await searchParams;

  const data = await withRole(session, async (db) => {
    const [{ today, latest }] = await rows(db, `
      SELECT CURRENT_DATE::text AS today,
             COALESCE((SELECT MAX(shift_date) FROM shift WHERE shift_date <= CURRENT_DATE),
                      (SELECT MAX(shift_date) FROM shift))::text AS latest`);
    const [{ has_today }] = await rows(db,
      'SELECT EXISTS (SELECT 1 FROM shift WHERE shift_date = CURRENT_DATE) AS has_today');
    const date = sp.date || (has_today ? today : latest) || today;
    const dept = sp.dept || '';

    const departments = await rows(db, 'SELECT department_id, name FROM department ORDER BY department_id');
    const shifts = await rows(db, `
      SELECT sh.shift_id, sh.shift_type, d.department_id, d.name AS department,
             to_char(sh.start_time, 'HH24:MI') || '–' || to_char(sh.end_time, 'HH24:MI') AS hours
      FROM shift sh JOIN department d ON d.department_id = sh.department_id
      WHERE sh.shift_date = $1 AND ($2 = '' OR sh.department_id = $2::int)
      ORDER BY d.department_id, sh.start_time`, [date, dept]);
    const people = await rows(db, `
      SELECT a.assignment_id, a.shift_id, a.status, s.full_name, s.role_title
      FROM shift_assignment a
      JOIN shift sh ON sh.shift_id = a.shift_id
      JOIN staff s ON s.staff_id = a.staff_id
      WHERE sh.shift_date = $1
      ORDER BY a.status = 'Cancelled', s.full_name`, [date]);
    const staff = await rows(db, `
      SELECT s.staff_id, s.full_name, d.name AS department
      FROM staff s JOIN department d ON d.department_id = s.department_id
      WHERE ($1 = '' OR s.department_id = $1::int)
      ORDER BY d.department_id, s.full_name`, [dept]);

    return { date, dept, departments, shifts, people, staff };
  });

  const { date, dept, departments, shifts, people, staff } = data;
  const byDept = departments
    .filter((d) => !dept || String(d.department_id) === dept)
    .map((d) => ({ ...d, slots: TYPES.map((t) => shifts.find((s) => s.department_id === d.department_id && s.shift_type === t)) }));
  const active = people.filter((p) => p.status !== 'Cancelled');
  const shiftLabel = (s) => `${s.department} · ${s.shift_type} ${s.hours}`;

  return (
    <>
      <Header kicker="Scheduler desk" title="Roster">
        Assigning is checked by the database: no double booking, at least 11 hours of rest,
        no shifts during approved leave, and the weekly hour cap.
      </Header>

      <form className="form-row" style={{ marginTop: 22 }}>
        <div className="field">
          <label htmlFor="date">Date</label>
          <input id="date" type="date" name="date" defaultValue={date} />
        </div>
        {dept && <input type="hidden" name="dept" value={dept} />}
        <button className="btn">Show day</button>
      </form>
      <Filters
        base="/admin/roster"
        name="dept"
        value={dept}
        keep={{ date }}
        options={[['All departments', ''], ...departments.map((d) => [d.name, d.department_id])]}
      />

      <Section title={`Board for ${date}`} note={`${active.length} people on shift`}>
        {shifts.length === 0 ? (
          <Empty>No shifts exist for this date. Open them below.</Empty>
        ) : (
          <div className="board">
            <div className="head">Department</div>
            {TYPES.map((t) => <div key={t} className="head">{t}</div>)}
            {byDept.map((d) => [
              <div key={d.name} className="dept">{d.name}</div>,
              ...d.slots.map((slot, i) => (
                <div key={d.name + i} className="slot">
                  {slot && <span className="time">{slot.hours}</span>}
                  {slot && people.filter((p) => p.shift_id === slot.shift_id).map((p) => (
                    <div key={p.assignment_id} className={`person ${p.status}`}>
                      <span>{p.full_name} {p.status !== 'Assigned' && <Tag value={p.status} />}</span>
                      {p.status !== 'Cancelled' && (
                        <ActionButton to={`/api/assignments/${p.assignment_id}`} method="DELETE" label="Cancel" danger />
                      )}
                    </div>
                  ))}
                  {slot && !people.some((p) => p.shift_id === slot.shift_id && p.status !== 'Cancelled') && (
                    <span className="dim">Open</span>
                  )}
                </div>
              )),
            ])}
          </div>
        )}
      </Section>

      {shifts.length > 0 && (
        <>
          <div className="panel">
            <h3>Assign someone</h3>
            <ApiForm to="/api/assignments" submit="Assign">
              <div className="field grow">
                <label>Shift</label>
                <select name="shift_id" required>
                  {shifts.map((s) => <option key={s.shift_id} value={s.shift_id}>{shiftLabel(s)}</option>)}
                </select>
              </div>
              <div className="field grow">
                <label>Staff member</label>
                <select name="staff_id" required>
                  {staff.map((s) => <option key={s.staff_id} value={s.staff_id}>{s.full_name} ({s.department})</option>)}
                </select>
              </div>
            </ApiForm>
          </div>

          <div className="panel">
            <h3>Swap two people</h3>
            <ApiForm to="/api/assignments/swap" submit="Swap">
              {['a', 'b'].map((k, i) => (
                <div key={k} className="field grow">
                  <label>{i === 0 ? 'First' : 'Second'}</label>
                  <select name={k} required defaultValue={active[i]?.assignment_id}>
                    {active.map((p) => {
                      const s = shifts.find((x) => x.shift_id === p.shift_id);
                      return <option key={p.assignment_id} value={p.assignment_id}>{p.full_name} · {s ? shiftLabel(s) : ''}</option>;
                    })}
                  </select>
                </div>
              ))}
            </ApiForm>
          </div>
        </>
      )}

      <div className="panel">
        <h3>Open shifts for a date</h3>
        <ApiForm to="/api/shifts" submit="Open shifts">
          <div className="field">
            <label>Date</label>
            <input type="date" name="date" required />
          </div>
          <span className="dim">Creates Morning, Evening and Night shifts for every department.</span>
        </ApiForm>
      </div>
    </>
  );
}
