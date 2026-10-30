// Check-in notes with semantic search (pgvector cosine distance on embeddings),
// optional department filter, and delete.
import { withRole, rows } from '@/lib/db.mjs';
import { requireRole } from '@/lib/session';
import { embed, toSql } from '@/lib/embed.mjs';
import { Header, Section, Mood, Empty } from '@/components/ui';
import ActionButton from '@/components/ActionButton';

export default async function Notes({ searchParams }) {
  const session = await requireRole('Admin');
  const { q = '', dept = '' } = await searchParams;
  const query = q.trim();
  const vector = query ? toSql(await embed(query)) : null;

  const { departments, notes } = await withRole(session, async (db) => ({
    departments: await rows(db, 'SELECT department_id, name FROM department ORDER BY department_id'),
    notes: await rows(db, `
      SELECT c.note_id, s.full_name, d.name AS department, c.mood_rating, c.note_text,
             to_char(c.created_at, 'DD Mon HH24:MI') AS written,
             CASE WHEN $1::vector IS NULL THEN NULL
                  ELSE ROUND((1 - (c.embedding <=> $1::vector))::numeric, 3) END AS similarity
      FROM checkin_note c
      JOIN staff s ON s.staff_id = c.staff_id
      JOIN department d ON d.department_id = s.department_id
      WHERE ($2 = '' OR d.department_id = $2::int)
        AND ($1::vector IS NULL OR c.embedding IS NOT NULL)
      ORDER BY CASE WHEN $1::vector IS NULL THEN NULL ELSE c.embedding <=> $1::vector END,
               c.created_at DESC
      LIMIT 20`, [vector, dept]),
  }));

  return (
    <>
      <Header kicker="Scheduler desk" title="Check-in notes">
        Search by meaning, not exact words. Each note is stored as a 384-number embedding
        (all-MiniLM-L6-v2) and compared with cosine distance in pgvector.
      </Header>

      <form className="form-row" style={{ marginTop: 22 }}>
        <div className="field grow">
          <label htmlFor="q">Search notes</label>
          <input id="q" name="q" defaultValue={query} placeholder="e.g. not getting enough sleep" />
        </div>
        <div className="field">
          <label htmlFor="dept">Department</label>
          <select id="dept" name="dept" defaultValue={dept}>
            <option value="">All</option>
            {departments.map((d) => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
          </select>
        </div>
        <button className="btn primary">Search</button>
        {(query || dept) && <a className="btn" href="/admin/notes">Clear</a>}
      </form>

      <Section title={query ? `Closest to “${query}”` : 'Latest notes'} note={`${notes.length} shown`}>
        {notes.length === 0 ? <Empty>No notes found.</Empty> : (
          <table className="ledger">
            <thead>
              <tr>{query && <th className="num">Match</th>}<th>Note</th><th>Name</th>
                <th>Department</th><th>Mood</th><th>Written</th><th></th></tr>
            </thead>
            <tbody>
              {notes.map((n) => (
                <tr key={n.note_id}>
                  {query && <td className="num">{n.similarity}</td>}
                  <td style={{ maxWidth: 380 }}>{n.note_text}</td>
                  <td>{n.full_name}</td>
                  <td>{n.department}</td>
                  <td><Mood value={n.mood_rating} /></td>
                  <td className="mono dim">{n.written}</td>
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
