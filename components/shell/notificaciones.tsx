'use client';

import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Bell } from 'lucide-react';
import { apiMutate, fetcher } from '@/lib/api';
import { haceCuanto } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { useRealtime } from '@/lib/realtime/socket-client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Notif {
  id: string;
  tipo: string;
  mensaje: string;
  link: string | null;
  leida: boolean;
  createdAt: string;
}

export function Notificaciones() {
  const router = useRouter();
  const { data, mutate } = useSWR<{ notificaciones: Notif[] }>(
    '/api/notificaciones',
    fetcher,
    { revalidateOnFocus: false },
  );

  useRealtime(['tareas', 'calendario', 'causas'], (ev) => {
    if (
      ev.t === 'notificacion' ||
      ev.t === 'documento:enviado' ||
      ev.t === 'causa:sincronizada'
    ) {
      void mutate();
    }
  });

  const notifs = data?.notificaciones ?? [];
  const sinLeer = notifs.filter((n) => !n.leida).length;

  async function marcarLeidas() {
    await apiMutate('/api/notificaciones', 'POST');
    void mutate();
  }

  return (
    <DropdownMenu
      onOpenChange={(abierto) => {
        if (abierto && sinLeer > 0) void marcarLeidas();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notificaciones" className="relative">
          <Bell className="size-4" />
          {sinLeer > 0 && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {sinLeer > 9 ? '9+' : sinLeer}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">Notificaciones</div>
        <div className="max-h-96 overflow-auto">
          {notifs.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nada por aquí.
            </p>
          )}
          {notifs.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                if (n.link) router.push(n.link);
              }}
              className={cn(
                'flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent',
                !n.leida && 'bg-primary/5',
              )}
            >
              <span>{n.mensaje}</span>
              <span className="text-xs text-muted-foreground">
                {haceCuanto(n.createdAt)}
              </span>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Toasts en vivo (PLAN §11), montado una sola vez en el shell. */
export function RealtimeToasts({ role }: { role: string }) {
  const router = useRouter();
  const esRevisor = role === 'admin' || role === 'abogado';

  useRealtime(['tareas', 'calendario', 'causas'], (ev) => {
    if (ev.t === 'notificacion') {
      (ev.nivel === 'warn' ? toast.warning : toast.info)(ev.mensaje);
    } else if (ev.t === 'documento:enviado' && esRevisor) {
      toast(`${ev.por} envió a revisión «${ev.titulo}»`, {
        duration: 10000,
        action: {
          label: 'Revisar',
          onClick: () => router.push(`/documentos/${ev.documentoId}`),
        },
      });
    }
  });

  return null;
}
