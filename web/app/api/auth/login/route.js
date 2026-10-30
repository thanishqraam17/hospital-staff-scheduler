// POST /api/auth/login  (plain HTML form post)
// The password is checked INSIDE the database by authenticate(), which compares
// it with the bcrypt hash. hospital_app cannot read the hashes itself.
import { NextResponse } from 'next/server';
import { pool, withRole } from '@/lib/db.mjs';
import { createSession } from '@/lib/session';

export async function POST(request) {
  const form = await request.formData();
  const username = String(form.get('username') || '').trim();
  const password = String(form.get('password') || '');

  const { rows } = await pool.query('SELECT * FROM authenticate($1, $2)', [username, password]);
  if (rows.length === 0) {
    return NextResponse.redirect(new URL('/login?error=1', request.url), 303);
  }
  const user = rows[0];

  let name = 'Administrator';
  if (user.role === 'Staff') {
    // staff can read their own staff row (Row Level Security)
    const me = await withRole({ role: 'Staff', staffId: user.staff_id }, (db) =>
      db.query('SELECT full_name FROM staff WHERE staff_id = $1', [user.staff_id])
    );
    name = me.rows[0]?.full_name ?? user.username;
  }

  const cookie = await createSession({
    userId: user.user_id,
    username: user.username,
    role: user.role,
    staffId: user.staff_id,
    name,
  });
  const response = NextResponse.redirect(
    new URL(user.role === 'Admin' ? '/admin' : '/staff', request.url),
    303
  );
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
