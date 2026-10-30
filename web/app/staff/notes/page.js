// Staff check-in notes: write (embedded on save), edit (re-embedded), delete.
import { withRole, rows } from '@/lib/db.mjs';
import { requireRole } from '@/lib/session';
import { Header, Section, Mood, Empty } from '@/components/ui';
import ApiForm from '@/components/ApiForm';
import ActionButton from '@/components/ActionButton';

function MoodSelect({ value = 3 }) {
  return (
    <div className="field">
      <label>Mood (1 low – 5 good)</label>
      <select name="mood_rating" defaultValue={String(value)}>
        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}

export default async function MyNotes() {
  const session = await requireRole('Staff');
  const notes = await withRole(session, (db) => rows(db, `
    SELECT note_id, note_text, mood_rating, to_char(created_at, 'DD Mon HH24:MI') AS written,
           embedding IS NOT NULL AS embedded
    FROM checkin_note ORDER BY created_at DESC`));

  return (
    <>
      <Header kicker="Staff desk" title="Check-in notes">
        A few words on how your shifts are going. The scheduler can search notes by meaning
        to spot people who are struggling.
      </Header>

      <div className="panel" style={{ marginTop: 26 }}>
        <h3>New note</h3>
        <ApiForm to="/api/notes" submit="Save note">
          <div className="field grow">
            <label>How are things?</label>
            <textarea name="note_text" required maxLength={500} />
          </div>
          <MoodSelect />
        </ApiForm>
      </div>

      <Section title="My notes" note={`${notes.length} in total`}>
        {notes.length === 0 ? <Empty>No notes yet.</Empty> : (
          <table className="ledger">
            <thead><tr><th>Written</th><th>Note</th><th>Mood</th><th></th></tr></thead>
            <tbody>
              {notes.map((n) => (
                <tr key={n.note_id}>
                  <td className="mono dim">{n.written}</td>
                  <td style={{ maxWidth: 460 }}>
                    {n.note_text}
                    <details style={{ marginTop: 6 }}>
                      <summary className="dim" style={{ cursor: 'pointer', fontSize: 13 }}>Edit</summary>
                      <ApiForm to={`/api/notes/${n.note_id}`} method="PATCH" submit="Update" reset={false}>
                        <div className="field grow">
                          <label>Note</label>
                          <textarea name="note_text" defaultValue={n.note_text} required maxLength={500} />
                        </div>
                        <MoodSelect value={n.mood_rating} />
                      </ApiForm>
                    </details>
                  </td>
                  <td><Mood value={n.mood_rating} /></td>
                  <td><ActionButton to={`/api/notes/${n.note_id}`} method="DELETE" label="Delete" danger /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
