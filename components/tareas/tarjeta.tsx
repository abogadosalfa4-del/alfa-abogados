'use client';

import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarClock, FileText, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hoyISO, fromYmd, differenceInCalendarDays } from '@/lib/fechas';
import { COLOR_BARRA, type Color } from '@/lib/schemas/tarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { TareaDTO } from '@/lib/tareas';

export function Tarjeta({
  tarea,
  onEditar,
  arrastrando,
}: {
  tarea: TareaDTO;
  onEditar?: () => void;
  arrastrando?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tarea.id });

  const diasRestantes = tarea.fechaLimite
    ? differenceInCalendarDays(fromYmd(tarea.fechaLimite), fromYmd(hoyISO()))
    : null;
  const urgente = diasRestantes !== null && diasRestantes <= 2;

  const iniciales = (tarea.asignadoNombre ?? '')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onDoubleClick={onEditar}
      className={cn(
        'flex cursor-grab gap-2 rounded-md border bg-card p-2.5 shadow-sm active:cursor-grabbing',
        (isDragging || arrastrando) && 'opacity-50',
      )}
    >
      <span className={cn('w-1 shrink-0 rounded-full', COLOR_BARRA[tarea.color as Color] ?? 'bg-primary')} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium leading-snug">{tarea.titulo}</p>
        {tarea.descripcion && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {tarea.descripcion}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {tarea.fechaLimite && (
            <span
              className={cn(
                'inline-flex items-center gap-1',
                urgente && 'font-medium text-destructive',
              )}
            >
              <CalendarClock className="size-3" />
              {tarea.fechaLimite}
            </span>
          )}
          {tarea.causaId && tarea.causaNumero && (
            <Link
              href={`/causas/${tarea.causaId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
            >
              <Scale className="size-3" />
              {tarea.causaNumero}
            </Link>
          )}
          {tarea.tieneDocumento && (
            <Link
              href={`/documentos/${tarea.documentoId}`}
              onClick={(e) => e.stopPropagation()}
              aria-label="Documento vinculado"
              className="hover:text-foreground"
            >
              <FileText className="size-3.5" />
            </Link>
          )}
          {tarea.asignadoNombre && (
            <Avatar className="ml-auto size-5">
              <AvatarFallback className="text-[10px]">{iniciales}</AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </div>
  );
}
