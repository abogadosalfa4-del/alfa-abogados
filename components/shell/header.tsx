'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notificaciones, RealtimeToasts } from '@/components/shell/notificaciones';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Role } from '@/lib/db/schema';

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  abogado: 'Abogado/a',
  secretario: 'Secretario/a',
  asistente: 'Asistente',
};

export function Header({
  user,
}: {
  user: { name: string; email: string; role: Role };
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');

  const iniciales = user.name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-card px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busqueda.trim()) {
            router.push(`/causas?q=${encodeURIComponent(busqueda.trim())}`);
          }
        }}
        className="relative w-full max-w-sm"
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar causa por número o cliente…"
          className="pl-8"
          aria-label="Búsqueda global de causas"
        />
      </form>

      <div className="ml-auto flex items-center gap-1">
        <RealtimeToasts role={user.role} />
        <Notificaciones />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                {iniciales || '?'}
              </span>
              <span className="hidden text-sm font-medium sm:inline">
                {user.name}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
                <span className="mt-1 text-xs font-normal text-primary">
                  {ROLE_LABEL[user.role]}
                </span>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
