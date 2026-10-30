// Leave requests: filter by status, approve or reject.
import { withRole, rows } from '@/lib/db.mjs';
import { requireRole } from '@/lib/session';
import { Header, Section, Tag, Empty, Filters } from '@/components/ui';
import ActionButton from '@/components/ActionButton';

export default async function Leaves({ searchParams }) {
  const session = await requireRole('Admin');
  const { status = '' } = await searchParams;

  const leaves = await withRole(session, (db) => rows(db, `
    SELECT l.leave_id, s.full_name, d.name AS department, l.start_date, l.end_date,
           (l.end_date - l.start_date + 1) AS days, l.reason, l.status,
           (SELECT COUNT(*) FROM shift_assignment a JOIN shift sh ON sh.shift_id = a.shift_id
            WHERE a.staff_id = l.staff_id AND a.status <> 'Cancelled'
              AND sh.shift_date BETWEEN l.start_date AND l.end_date) AS shifts_affected
    FROM leave_request l
    JOIN staff s ON s.staff_id = l.staff_id
    JOIN department d ON d.department_id = s.department_id
    WHERE ($1 = '' OR l.status = $1)
    ORDER BY l.status <> 'Pending', l.start_date`, [status]));

  return (
    <>
      <Header kicker="Scheduler desk" title="Leave requests">
        Approving a leave automatically cancels that person&apos;s shifts in the period (database trigger).
      </Header>
      <Filters
        base="/admin/leaves"
        name="status"
        value={status}
        options={[['All', ''], ['Pending', 'Pending'], ['Approved', 'Approved'], ['Rejected', 'Rejected']]}
      />
      <Section title="Requests" note={`${leaves.length} shown`}>
        {leaves.length === 0 ? (
          <Empty>No requests here.</Empty>
        ) : (
          <table className="ledger">
            <thead>
              <tr><th>Name</th><th>Department</th><th>From</th><th>To</th><th className="num">Days</th>
                <th>Reason</th><th className="num">Shifts in period</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {leaves.map((l) => (
                <tr key={l.leave_id}>
                  <td>{l.full_name}</td>
                  <td>{l.department}</td>
                  <td className="mono">{l.start_date}</td>
                  <td className="mono">{l.end_date}</td>
                  <td className="num">{l.days}</td>
                  <td>{l.reason ?? <span className="dim">–</span>}</td>
                  <td className="num">{l.shifts_affected}</td>
                  <td><Tag value={l.status} /></td>
                  <td>
                    {l.status === 'Pending' && (
                      <span className="btn-row">
                        <ActionButton to={`/api/leaves/${l.leave_id}`} method="PATCH" body={{ status: 'Approved' }} label="Approve" />
                        <ActionButton to={`/api/leaves/${l.leave_id}`} method="PATCH" body={{ status: 'Rejected' }} label="Reject" danger />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
