// POST /api/notes  (Staff) - write a check-in note.
// The text is turned into a 384-number embedding and stored in the vector column.
import { api } from '@/lib/api';
import { embed, toSql } from '@/lib/embed.mjs';

export const POST = api('Staff', async ({ db, body, session }) => {
  const text = String(body.note_text || '').trim();
  const vector = text ? toSql(await embed(text)) : null;
  await db.query(
    `INSERT INTO checkin_note (staff_id, note_text, mood_rating, embedding)
     VALUES ($1, $2, $3::int, $4::vector)`,
    [session.staffId, text, body.mood_rating, vector]
  );
  return { message: 'Note saved and embedded.' };
});
