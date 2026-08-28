import { redirect } from 'next/navigation';
import { getSession } from '@/lib/http';
import type { Role } from '@/lib/db/schema';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const role = ((session?.user as { role?: Role })?.role ?? 'asistente') as Role;
  if (role !== 'admin') redirect('/calendario');
  return <>{children}</>;
}
