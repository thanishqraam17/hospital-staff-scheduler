import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

// "/" sends each user to their own area
export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/login');
  redirect(session.role === 'Admin' ? '/admin' : '/staff');
}
