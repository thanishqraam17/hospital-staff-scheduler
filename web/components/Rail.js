'use client';
// Dark side rail with navigation and the logged-in user.
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Rail({ links, name, role }) {
  const path = usePathname();
  return (
    <aside className="rail">
      <div className="desk">{role === 'Admin' ? 'Scheduler desk' : 'Staff desk'}</div>
      <nav>
        {links.map(([href, label]) => {
          const active = href === path || (href !== links[0][0] && path.startsWith(href));
          return (
            <Link key={href} href={href} className={active ? 'active' : ''}>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="who">
        Signed in as
        <strong>{name}</strong>
        {role}
        <form action="/api/auth/logout" method="post">
          <button>Sign out</button>
        </form>
      </div>
    </aside>
  );
}
