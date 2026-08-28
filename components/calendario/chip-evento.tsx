'use client';

import { cn } from '@/lib/utils';
import { TIPO_META } from '@/components/calendario/meta';
import {
  inferirEtiqueta,
  textoClienteCorto,
  textoJuicioCorto,
} from '@/lib/etiquetas-evento';
import type { EventoDTO } from '@/lib/eventos';

export function ChipEvento({
  evento,
  onClick,
}: {
  evento: EventoDTO;
  onClick: () => void;
}) {
  const meta = TIPO_META[evento.tipo];
  const cancelado = evento.estado === 'cancelado';
  const etiqueta = evento.etiqueta ?? inferirEtiqueta(evento.titulo, evento.tipo);
  const juicio = textoJuicioCorto(evento.causaNumero);
  const cliente = textoClienteCorto(evento.clienteNombre);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${etiqueta} · ${juicio} · ${cliente}`}
      className={cn(
        'flex w-full min-w-0 flex-col rounded-sm px-1 py-0.5 text-left leading-tight',
        meta.chipClass,
        cancelado && 'line-through opacity-50',
        evento.estado === 'cumplido' && 'opacity-60',
      )}
    >
      <span className="flex min-w-0 items-center gap-1 text-xs">
        {evento.hora && (
          <span className="shrink-0 font-medium tabular-nums">{evento.hora}</span>
        )}
        <span className="truncate font-semibold">{etiqueta}</span>
      </span>
      <span className="truncate text-[10px] opacity-80">
        {juicio} · {cliente}
      </span>
    </button>
  );
}
