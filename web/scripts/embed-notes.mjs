// Generates embeddings for every check-in note that does not have one yet.
// Run from the web folder:  node --env-file=.env.local scripts/embed-notes.mjs
import { pool } from '../lib/db.mjs';
import { embed, toSql } from '../lib/embed.mjs';

const { rows } = await pool.query(
  'SELECT note_id, note_text FROM checkin_note WHERE embedding IS NULL ORDER BY note_id'
);
console.log(`Notes without embeddings: ${rows.length}`);

for (const note of rows) {
  const vector = await embed(note.note_text);
  await pool.query('UPDATE checkin_note SET embedding = $1::vector WHERE note_id = $2', [
    toSql(vector),
    note.note_id,
  ]);
  console.log(`  note ${note.note_id}: embedded (${vector.length} dimensions)`);
}

const { rows: check } = await pool.query(
  'SELECT COUNT(*) AS total, COUNT(embedding) AS embedded FROM checkin_note'
);
console.log(`Done. ${check[0].embedded} of ${check[0].total} notes have embeddings.`);
await pool.end();
