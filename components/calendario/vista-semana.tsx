'use client';

import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toYmd, formatDate } from '@/lib/fechas';
import { ChipEvento } from '@/components/calendario/chip-evento';
import { ORDEN_TIPO } from '@/components/calendario/meta';
import type { EventoDTO } from '@/lib/eventos';

export function VistaSemana({
  dias,
  hoy,
  eventosPorDia,
  puedeEditar,
  onNuevoEnFecha,
  onAbrirEvento,
}: {
  dias: Date[];
  hoy: string;
  eventosPorDia: Map<string, EventoDTO[]>;
  puedeEditar: boolean;
  onNuevoEnFecha: (ymd: string) => void;
  onAbrirEvento: (evento: EventoDTO) => void;
}) {
  return (
    <div className="grid flex-1 grid-cols-7 gap-2 overflow-auto rounded-lg border bg-card p-2">
      {dias.map((dia) => {
        const ymd = toYmd(dia);
        const esHoy = ymd === hoy;
        const lista = (eventosPorDia.get(ymd) ?? [])
          .slice()
          .sort(
            (a, b) =>
              (a.hora ?? '99').localeCompare(b.hora ?? '99') ||
              ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo],
          );
        return (
          <div
            key={ymd}
            onClick={() => puedeEditar && onNuevoEnFecha(ymd)}
            className={cn(
              'flex min-h-64 flex-col gap-1 rounded-md border p-1.5',
              esHoy && 'border-primary/40 bg-primary/5',
              puedeEditar && 'cursor-pointer hover:bg-accent/30',
            )}
          >
            <div
              className={cn(
                'mb-1 text-center text-xs font-medium capitalize',
                esHoy ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {formatDate(dia, 'EEE d', { locale: es })}
            </div>
            {lista.map((ev) => (
              <ChipEvento key={ev.id} evento={ev} onClick={() => onAbrirEvento(ev)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
