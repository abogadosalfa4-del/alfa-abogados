'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { COLUMNA_LABEL, type Columna as ColId } from '@/lib/schemas/tarea';
import { Tarjeta } from '@/components/tareas/tarjeta';
import type { TareaDTO } from '@/lib/tareas';

export function Columna({
  id,
  tareas,
  onEditar,
}: {
  id: ColId;
  tareas: TareaDTO[];
  onEditar: (t: TareaDTO) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${id}` });

  return (
    <div className="flex min-h-0 w-full flex-col rounded-lg border bg-muted/30">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold">{COLUMNA_LABEL[id]}</h2>
        <span className="rounded-full bg-background px-2 text-xs font-medium text-muted-foreground">
          {tareas.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-1 flex-col gap-2 overflow-y-auto p-2 pt-0',
          isOver && 'bg-accent/40',
        )}
      >
        <SortableContext
          items={tareas.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tareas.map((t) => (
            <Tarjeta key={t.id} tarea={t} onEditar={() => onEditar(t)} />
          ))}
        </SortableContext>
        {tareas.length === 0 && (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            Nada por aquí.
          </p>
        )}
      </div>
    </div>
  );
}
