// Shared wrapper for Route Handlers (the backend API).
// 1. checks the logged-in role, 2. reads the JSON body,
// 3. runs the work inside withRole() so the DATABASE enforces access,
// 4. turns database errors (constraints, triggers, RLS) into readable messages.
import { NextResponse } from 'next/server';
import { getSession } from './session';
import { withRole } from './db.mjs';

export function api(allowedRole, work) {
  return async (request, context) => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
    if (allowedRole && session.role !== allowedRole) {
      return NextResponse.json({ error: `Only ${allowedRole} users can do this.` }, { status: 403 });
    }

    let body = {};
    if (request.method !== 'GET' && request.method !== 'DELETE') {
      body = await request.json().catch(() => ({}));
    }
    const params = context?.params ? await context.params : {};

    try {
      const result = await withRole(session, (db) => work({ db, body, params, session }));
      return NextResponse.json(result ?? { message: 'Done.' });
    } catch (error) {
      return NextResponse.json({ error: explain(error) }, { status: 400 });
    }
  };
}

function explain(error) {
  switch (error.code) {
    case '23505': return 'That record already exists.';
    case '23514': return `Rejected by a CHECK constraint (${error.constraint}).`;
    case '23503': return 'Refers to something that does not exist.';
    case '23502': return `Missing value for ${error.column}.`;
    case '42501': return `Database refused: ${error.message}`;
    case '22P02':
    case '22007':
    case '22008': return 'One of the values is not in the right format.';
    default: return error.message;   // trigger messages are already readable
  }
}

export function fail(message) {
  const error = new Error(message);
  error.code = 'APP';
  throw error;
}
