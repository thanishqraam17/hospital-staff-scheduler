// Staff leave: request leave (only for yourself, only as Pending - enforced by RLS)
// and see your own requests.
import { withRole, rows } from '@/lib/db.mjs';
import { requireRole } from '@/lib/session';
import { Header, Section, Tag, Empty } from '@/components/ui';
import ApiForm from '@/components/ApiForm';

export default async function MyLeave() {
  const session = await requireRole('Staff');
  const leaves = await withRole(session, (db) => rows(db, `
    SELECT leave_id, start_date, end_date, (end_date - start_date + 1) AS days, reason, status
    FROM leave_request ORDER BY start_date DESC`));

  return (
    <>
      <Header kicker="Staff desk" title="Leave">
        Requests go to the scheduler. Once approved, your shifts in that period are cancelled automatically.
      </Header>

      <div className="panel" style={{ marginTop: 26 }}>
        <h3>Request leave</h3>
        <ApiForm to="/api/leaves" submit="Send request">
          <div className="field">
            <label>From</label>
            <input type="date" name="start_date" required />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" name="end_date" required />
          </div>
          <div className="field grow">
            <label>Reason</label>
            <input name="reason" maxLength={255} placeholder="optional" />
          </div>
        </ApiForm>
      </div>

      <Section title="My requests" note={`${leaves.length} in total`}>
        {leaves.length === 0 ? <Empty>You have not requested leave.</Empty> : (
          <table className="ledger">
            <thead><tr><th>From</th><th>To</th><th className="num">Days</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>
              {leaves.map((l) => (
                <tr key={l.leave_id}>
                  <td className="mono">{l.start_date}</td><td className="mono">{l.end_date}</td>
                  <td className="num">{l.days}</td><td>{l.reason ?? <span className="dim">–</span>}</td>
                  <td><Tag value={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
