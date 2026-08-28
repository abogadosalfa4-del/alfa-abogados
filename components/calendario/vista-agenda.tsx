'use client';

import { fromYmd, formatDate } from '@/lib/fechas';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { TIPO_META, ORDEN_TIPO } from '@/components/calendario/meta';
import type { EventoDTO } from '@/lib/eventos';

export function VistaAgenda({
  eventos,
  hoy,
  onAbrirEvento,
}: {
  eventos: EventoDTO[];
  hoy: string;
  onAbrirEvento: (evento: EventoDTO) => void;
}) {
  const porDia = new Map<string, EventoDTO[]>();
  for (const ev of eventos) {
    const arr = porDia.get(ev.fecha) ?? [];
    arr.push(ev);
    porDia.set(ev.fecha, arr);
  }
  const dias = [...porDia.keys()].sort();

  if (dias.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
        Sin eventos en este rango.
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 overflow-auto rounded-lg border bg-card p-4">
      {dias.map((ymd) => {
        const lista = (porDia.get(ymd) ?? [])
          .slice()
          .sort(
            (a, b) =>
              (a.hora ?? '99').localeCompare(b.hora ?? '99') ||
              ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo],
          );
        return (
          <div key={ymd}>
            <h3
              className={cn(
                'mb-1 text-sm font-semibold capitalize',
                ymd === hoy && 'text-primary',
              )}
            >
              {formatDate(fromYmd(ymd), "EEEE d 'de' LLLL", { locale: es })}
            </h3>
            <ul className="divide-y">
              {lista.map((ev) => {
                const meta = TIPO_META[ev.tipo];
                return (
                  <li key={ev.id}>
                    <button
                      type="button"
                      onClick={() => onAbrirEvento(ev)}
                      className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-accent/40"
                    >
                      <span
                        className="w-12 shrink-0 tabular-nums text-muted-foreground"
                      >
                        {ev.hora ?? '—'}
                      </span>
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span
                        className={cn(
                          'min-w-0 flex-1',
                          ev.estado === 'cancelado' && 'line-through opacity-50',
                        )}
                      >
                        <span className="block truncate font-medium">
                          {ev.etiqueta ?? ev.titulo}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {ev.causaNumero?.trim() || 'SIN JUICIO'} ·{' '}
                          {ev.clienteNombre?.trim() || 'SIN CLIENTE'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
