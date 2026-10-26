// Demonstrates the vector feature: Read (similarity search), Update, Delete.
// Run from the web folder:  node --env-file=.env.local scripts/vector-demo.mjs
import { pool } from '../lib/db.mjs';
import { embed, toSql } from '../lib/embed.mjs';

// READ: top-k notes closest in meaning to a query (cosine distance <=>)
async function search(query, k = 5, department = null) {
  const vector = toSql(await embed(query));
  const { rows } = await pool.query(
    `SELECT c.note_id, s.full_name, d.name AS department, c.mood_rating,
            ROUND((1 - (c.embedding <=> $1::vector))::numeric, 3) AS similarity,
            c.note_text
     FROM checkin_note c
     JOIN staff s      ON s.staff_id = c.staff_id
     JOIN department d ON d.department_id = s.department_id
     WHERE c.embedding IS NOT NULL
       AND ($3::text IS NULL OR d.name = $3)
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    [vector, k, department]
  );
  return rows;
}

function show(title, rows) {
  console.log(`\n=== ${title} ===`);
  console.table(rows);
}

// 1. READ: semantic search (words differ, meaning matches)
show(
  'READ: notes similar to "I am exhausted and not sleeping enough"',
  await search('I am exhausted and not sleeping enough')
);

// 2. READ with metadata filter: same search, ICU only
show('READ with filter: same query, ICU department only',
  await search('I am exhausted and not sleeping enough', 3, 'ICU'));

// 3. Insert a demo note (with its embedding) to work on
const newText = 'The team was great today and I left on time.';
const { rows: inserted } = await pool.query(
  `INSERT INTO checkin_note (staff_id, note_text, mood_rating, embedding)
   VALUES (3, $1, 4, $2::vector) RETURNING note_id`,
  [newText, toSql(await embed(newText))]
);
const demoId = inserted[0].note_id;
console.log(`\nInserted demo note ${demoId}: "${newText}"`);

show('Search "feeling burnt out" BEFORE update',
  (await search('feeling burnt out', 20)).filter((r) => r.note_id === demoId));

// 4. UPDATE: change the text and re-embed it so search reflects the new meaning
const updatedText = 'Completely burnt out, double shifts and no breaks all week.';
await pool.query(
  `UPDATE checkin_note SET note_text = $1, mood_rating = 1, embedding = $2::vector
   WHERE note_id = $3`,
  [updatedText, toSql(await embed(updatedText)), demoId]
);
console.log(`\nUPDATE: note ${demoId} changed to "${updatedText}" and re-embedded`);

show('Search "feeling burnt out" AFTER update (similarity should rise)',
  (await search('feeling burnt out', 20)).filter((r) => r.note_id === demoId));

// 5. DELETE: remove the note and its vector
await pool.query('DELETE FROM checkin_note WHERE note_id = $1', [demoId]);
const { rows: gone } = await pool.query(
  'SELECT COUNT(*) AS remaining FROM checkin_note WHERE note_id = $1', [demoId]);
console.log(`\nDELETE: note ${demoId} removed, rows remaining with that id: ${gone[0].remaining}`);

await pool.end();
