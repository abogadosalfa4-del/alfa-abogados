'use client';

import useSWR from 'swr';
import { es } from 'date-fns/locale';
import { fetcher } from '@/lib/api';
import { cn } from '@/lib/utils';
import { fromYmd, formatDate, hoyISO } from '@/lib/fechas';
import { useRealtime } from '@/lib/realtime/socket-client';
import { TIPO_META, ORDEN_TIPO } from '@/components/calendario/meta';
import type { EventoDTO } from '@/lib/eventos';

export function PanelProximos({
  onAbrirEvento,
}: {
  onAbrirEvento: (evento: EventoDTO) => void;
}) {
  const { data, mutate } = useSWR<{ eventos: EventoDTO[] }>(
    '/api/eventos/proximos',
    fetcher,
    { revalidateOnFocus: false },
  );
  useRealtime('calendario', (ev) => {
    if (ev.t.startsWith('evento:')) void mutate();
  });

  const hoy = hoyISO();
  const eventos = (data?.eventos ?? []).slice().sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] ||
      (a.hora ?? '99').localeCompare(b.hora ?? '99'),
  );

  return (
    <aside className="hidden w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-card xl:flex">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Próximos 7 días</h2>
        <p className="text-xs text-muted-foreground">Escritos primero</p>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {eventos.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Nada pendiente esta semana.
          </p>
        )}
        <ul className="space-y-1">
          {eventos.map((ev) => {
            const meta = TIPO_META[ev.tipo];
            return (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => onAbrirEvento(ev)}
                  className="w-full rounded-md border-l-2 bg-muted/40 px-2.5 py-2 text-left hover:bg-accent"
                  style={{ borderColor: meta.color }}
                >
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span
                      className={cn('capitalize', ev.fecha === hoy && 'font-semibold text-primary')}
                    >
                      {formatDate(fromYmd(ev.fecha), "EEE d 'de' LLL", { locale: es })}
                    </span>
                    {ev.hora && <span className="tabular-nums">{ev.hora}</span>}
                  </div>
                  <p className="truncate text-sm font-medium">
                    {ev.etiqueta ?? ev.titulo}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ev.causaNumero?.trim() || 'SIN JUICIO'} ·{' '}
                    {ev.clienteNombre?.trim() || 'SIN CLIENTE'}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
