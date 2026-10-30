// PATCH  /api/notes/:id  (Staff) - edit own note and RE-EMBED it (vector Update)
// DELETE /api/notes/:id  (Staff own note / Admin any note) - remove note and vector
// Row Level Security decides whose notes can be touched.
import { api, fail } from '@/lib/api';
import { embed, toSql } from '@/lib/embed.mjs';

export const PATCH = api('Staff', async ({ db, body, params }) => {
  const text = String(body.note_text || '').trim();
  if (!text) fail('The note cannot be empty.');
  const { rowCount } = await db.query(
    `UPDATE checkin_note SET note_text = $1, mood_rating = $2::int, embedding = $3::vector
     WHERE note_id = $4::int`,
    [text, body.mood_rating, toSql(await embed(text)), params.id]
  );
  if (!rowCount) fail('Note not found.');
  return { message: 'Note updated and re-embedded.' };
});

export const DELETE = api(null, async ({ db, params }) => {
  const { rowCount } = await db.query('DELETE FROM checkin_note WHERE note_id = $1::int', [params.id]);
  if (!rowCount) fail('Note not found or not yours.');
  return { message: 'Note deleted.' };
});
