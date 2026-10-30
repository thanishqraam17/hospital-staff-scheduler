import Rail from '@/components/Rail';
import { requireRole } from '@/lib/session';

export default async function AdminLayout({ children }) {
  const session = await requireRole('Admin');
  return (
    <div className="shell">
      <Rail
        role="Admin"
        name={session.name}
        links={[
          ['/admin', 'Burnout watch'],
          ['/admin/roster', 'Roster'],
          ['/admin/leaves', 'Leave requests'],
          ['/admin/overtime', 'Overtime'],
          ['/admin/notes', 'Check-in notes'],
        ]}
      />
      <main className="page">{children}</main>
    </div>
  );
}
