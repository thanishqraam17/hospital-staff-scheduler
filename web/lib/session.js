// Login sessions: a signed (HS256) token stored in an HttpOnly cookie.
// SESSION_SECRET comes from .env.local.
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE = 'ward_session';

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is missing from .env.local');
  return new TextEncoder().encode(secret);
}

export async function createSession(user) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(key());
  return {
    name: COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 8 * 60 * 60,
    },
  };
}

export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return payload;
  } catch {
    return null;
  }
}

// for pages: send the user to the right place if they are not allowed here
export async function requireRole(role) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (role && session.role !== role) redirect(session.role === 'Admin' ? '/admin' : '/staff');
  return session;
}

export const SESSION_COOKIE = COOKIE;
