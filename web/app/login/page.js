import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function LoginPage({ searchParams }) {
  const session = await getSession();
  if (session) redirect(session.role === 'Admin' ? '/admin' : '/staff');
  const { error } = await searchParams;

  return (
    <div className="login">
      <div className="left">
        <div className="kicker" style={{ color: '#9aa3b5' }}>Hospital Staff Scheduling &amp; Burnout Risk Detector</div>
        <h1>Who is on the floor tonight, and who needs a break?</h1>
        <div className="lines">
          <div><b>07:00</b> Morning · <b>15:00</b> Evening · <b>23:00</b> Night</div>
          <div>11 h minimum rest · weekly hour caps · burnout watch</div>
        </div>
      </div>

      <div className="right">
        <h1 className="title">Sign in</h1>
        <form action="/api/auth/login" method="post">
          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" name="username" required autoComplete="username" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          {error && <div className="notice err">Wrong username or password.</div>}
          <div><button className="btn primary">Sign in</button></div>
        </form>
        <p className="hint">
          Demo accounts: <span className="mono">admin / admin123</span> (scheduler) or any staff first
          name, e.g. <span className="mono">ananya / staff123</span>.
        </p>
      </div>
    </div>
  );
}
