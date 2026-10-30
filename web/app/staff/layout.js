import Rail from '@/components/Rail';
import { requireRole } from '@/lib/session';

export default async function StaffLayout({ children }) {
  const session = await requireRole('Staff');
  return (
    <div className="shell">
      <Rail
        role="Staff"
        name={session.name}
        links={[
          ['/staff', 'My week'],
          ['/staff/leave', 'Leave'],
          ['/staff/notes', 'Check-in notes'],
        ]}
      />
      <main className="page">{children}</main>
    </div>
  );
}
