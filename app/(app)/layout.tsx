import { redirect } from 'next/navigation';
import { sesionOficina } from '@/lib/auth-local';
import { Sidebar } from '@/components/shell/sidebar';
import { Header } from '@/components/shell/header';
import { Providers } from '@/components/shell/providers';
import type { Role } from '@/lib/db/schema';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = sesionOficina();
  if (!session?.user) redirect('/login');

  const role = ((session.user as { role?: Role }).role ?? 'asistente') as Role;

  return (
    <Providers
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role,
      }}
    >
      <div className="flex h-screen overflow-hidden">
        <Sidebar role={role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            user={{
              name: session.user.name,
              email: session.user.email,
              role,
            }}
          />
          <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-muted/20">
            {children}
          </main>
        </div>
      </div>
    </Providers>
  );
}
