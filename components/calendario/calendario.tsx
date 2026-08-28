'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EventoBorrador } from '@/lib/outlook/clasificador';
import {
  addDays,
  addMonths,
  fromYmd,
  gridAgenda,
  gridMes,
  gridSemana,
  hoyISO,
  mesLegible,
} from '@/lib/fechas';
import { Button } from '@/components/ui/button';
import { useEventos } from '@/components/calendario/use-eventos';
import { VistaMes } from '@/components/calendario/vista-mes';
import { VistaSemana } from '@/components/calendario/vista-semana';
import { VistaAgenda } from '@/components/calendario/vista-agenda';
import { PanelProximos } from '@/components/calendario/panel-proximos';
import { DialogEvento } from '@/components/calendario/dialog-evento';
import { Leyenda } from '@/components/calendario/leyenda';
import type { EventoDTO } from '@/lib/eventos';

type Vista = 'mes' | 'semana' | 'agenda';
type Modo =
  | { tipo: 'crear'; fecha: string; borrador?: EventoBorrador }
  | { tipo: 'editar'; evento: EventoDTO }
  | { tipo: 'detalle'; evento: EventoDTO }
  | null;

const VISTAS: { id: Vista; label: string }[] = [
  { id: 'mes', label: 'Mes' },
  { id: 'semana', label: 'Semana' },
  { id: 'agenda', label: 'Agenda' },
];

export function Calendario({ puedeEditar }: { puedeEditar: boolean }) {
  const [vista, setVista] = useState<Vista>('mes');
  const [ancla, setAncla] = useState(() => fromYmd(hoyISO()));
  const [modo, setModo] = useState<Modo>(null);

  const rango = useMemo(() => {
    if (vista === 'mes') return gridMes(ancla);
    if (vista === 'semana') return gridSemana(ancla);
    return gridAgenda(ancla, 30);
  }, [vista, ancla]);

  const { eventos, refetch } = useEventos(rango.desde, rango.hasta);

  const eventosPorDia = useMemo(() => {
    const m = new Map<string, EventoDTO[]>();
    for (const ev of eventos) {
      const arr = m.get(ev.fecha) ?? [];
      arr.push(ev);
      m.set(ev.fecha, arr);
    }
    return m;
  }, [eventos]);

  const hoy = hoyISO();

  function irHoy() {
    setAncla(fromYmd(hoy));
  }
  function mover(dir: -1 | 1) {
    setAncla((a) =>
      vista === 'mes'
        ? addMonths(a, dir)
        : addDays(a, dir * (vista === 'semana' ? 7 : 30)),
    );
  }

  async function onSoltarCorreo(ymd: string, dt: DataTransfer) {
    const fd = new FormData();
    fd.append('fecha', ymd);
    const archivo = Array.from(dt.files).find((f) =>
      /\.(msg|eml)$/i.test(f.name),
    );
    if (archivo) {
      fd.append('file', archivo);
    } else {
      const texto = dt.getData('text/plain');
      if (!texto) {
        toast.error('Arrastrá un archivo .msg o .eml a la celda.');
        return;
      }
      fd.append('text', texto);
    }
    try {
      const res = await fetch('/api/eventos/desde-correo', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'Error');
      const { borrador } = (await res.json()) as { borrador: EventoBorrador };
      toast.info('Confirmá el evento detectado en el correo.');
      setModo({ tipo: 'crear', fecha: borrador.fecha, borrador });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo leer el correo');
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => mover(-1)} aria-label="Anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={irHoy}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" onClick={() => mover(1)} aria-label="Siguiente">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <h1 className="text-lg font-semibold capitalize">{mesLegible(ancla)}</h1>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            {VISTAS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVista(v.id)}
                className={cn(
                  'rounded px-3 py-1 text-sm font-medium transition-colors',
                  vista === v.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          {puedeEditar && (
            <Button size="sm" onClick={() => setModo({ tipo: 'crear', fecha: hoy })}>
              <Plus className="size-4" /> Nuevo evento
            </Button>
          )}
        </div>
      </div>

      <Leyenda />

      <div className="flex min-h-0 flex-1 gap-3">
        {vista === 'mes' && (
          <VistaMes
            dias={rango.dias as Date[]}
            ancla={ancla}
            hoy={hoy}
            eventosPorDia={eventosPorDia}
            puedeEditar={puedeEditar}
            onNuevoEnFecha={(fecha) => setModo({ tipo: 'crear', fecha })}
            onAbrirEvento={(evento) => setModo({ tipo: 'detalle', evento })}
            onSoltarCorreo={onSoltarCorreo}
          />
        )}
        {vista === 'semana' && (
          <VistaSemana
            dias={rango.dias as Date[]}
            hoy={hoy}
            eventosPorDia={eventosPorDia}
            puedeEditar={puedeEditar}
            onNuevoEnFecha={(fecha) => setModo({ tipo: 'crear', fecha })}
            onAbrirEvento={(evento) => setModo({ tipo: 'detalle', evento })}
          />
        )}
        {vista === 'agenda' && (
          <VistaAgenda
            eventos={eventos}
            hoy={hoy}
            onAbrirEvento={(evento) => setModo({ tipo: 'detalle', evento })}
          />
        )}

        <PanelProximos
          onAbrirEvento={(evento) => setModo({ tipo: 'detalle', evento })}
        />
      </div>

      <DialogEvento
        modo={modo}
        onOpenChange={(abierto) => !abierto && setModo(null)}
        puedeEditar={puedeEditar}
        onCambio={() => void refetch()}
        onSolicitarEdicion={(evento) => setModo({ tipo: 'editar', evento })}
      />
    </div>
  );
}
