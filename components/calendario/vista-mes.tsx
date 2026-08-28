'use client';

import { useState } from 'react';
import { isSameMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { toYmd } from '@/lib/fechas';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChipEvento } from '@/components/calendario/chip-evento';
import { ORDEN_TIPO } from '@/components/calendario/meta';
import type { EventoDTO } from '@/lib/eventos';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MAX_CHIPS = 3;

export function VistaMes({
  dias,
  ancla,
  hoy,
  eventosPorDia,
  puedeEditar,
  onNuevoEnFecha,
  onAbrirEvento,
  onSoltarCorreo,
}: {
  dias: Date[];
  ancla: Date;
  hoy: string;
  eventosPorDia: Map<string, EventoDTO[]>;
  puedeEditar: boolean;
  onNuevoEnFecha: (ymd: string) => void;
  onAbrirEvento: (evento: EventoDTO) => void;
  onSoltarCorreo: (ymd: string, dt: DataTransfer) => void;
}) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-7 border-b text-xs font-medium text-muted-foreground">
        {DIAS.map((d) => (
          <div key={d} className="px-2 py-1.5 text-center">
            {d}
          </div>
        ))}
      </div>
      <div
        className="grid flex-1 grid-cols-7 grid-rows-[repeat(var(--filas),minmax(0,1fr))]"
        style={{ ['--filas' as string]: String(dias.length / 7) }}
      >
        {dias.map((dia) => {
          const ymd = toYmd(dia);
          const delMes = isSameMonth(dia, ancla);
          const esHoy = ymd === hoy;
          const lista = (eventosPorDia.get(ymd) ?? [])
            .slice()
            .sort(
              (a, b) =>
                (a.hora ?? '99').localeCompare(b.hora ?? '99') ||
                ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo],
            );
          const visibles = lista.slice(0, MAX_CHIPS);
          const resto = lista.slice(MAX_CHIPS);

          return (
            <div
              key={ymd}
              onClick={() => puedeEditar && onNuevoEnFecha(ymd)}
              onDragOver={(e) => {
                if (puedeEditar && e.dataTransfer.types.includes('Files')) {
                  e.preventDefault();
                  setDropTarget(ymd);
                }
              }}
              onDragLeave={() => setDropTarget((c) => (c === ymd ? null : c))}
              onDrop={(e) => {
                if (!puedeEditar) return;
                e.preventDefault();
                setDropTarget(null);
                onSoltarCorreo(ymd, e.dataTransfer);
              }}
              className={cn(
                'flex flex-col gap-0.5 border-b border-r p-1 last:border-r-0',
                !delMes && 'bg-muted/30 text-muted-foreground',
                puedeEditar && 'cursor-pointer hover:bg-accent/40',
                dropTarget === ymd && 'border-2 border-dashed border-primary bg-primary/10',
              )}
            >
              <div className="flex justify-end">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-xs',
                    esHoy && 'bg-primary font-semibold text-primary-foreground',
                  )}
                >
                  {dia.getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {visibles.map((ev) => (
                  <ChipEvento
                    key={ev.id}
                    evento={ev}
                    onClick={() => onAbrirEvento(ev)}
                  />
                ))}
                {resto.length > 0 && (
                  <Popover>
                    <PopoverTrigger
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-sm px-1 py-0.5 text-left text-xs font-medium text-muted-foreground hover:bg-accent"
                    >
                      +{resto.length} más
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-80 space-y-1 p-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                        {ymd}
                      </p>
                      {lista.map((ev) => (
                        <ChipEvento
                          key={ev.id}
                          evento={ev}
                          onClick={() => onAbrirEvento(ev)}
                        />
                      ))}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
