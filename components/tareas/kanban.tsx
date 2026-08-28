'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { ordenEntre } from '@/lib/orden';
import { COLUMNAS, type Columna as ColId } from '@/lib/schemas/tarea';
import { Button } from '@/components/ui/button';
import { Columna } from '@/components/tareas/columna';
import { Tarjeta } from '@/components/tareas/tarjeta';
import { DialogTarea } from '@/components/tareas/dialog-tarea';
import { FiltrosTareas, type Filtros } from '@/components/tareas/filtros';
import { useTareas } from '@/components/tareas/use-tareas';
import type { TareaDTO } from '@/lib/tareas';

type ModoDialog =
  | { tipo: 'crear' }
  | { tipo: 'editar'; tarea: TareaDTO }
  | null;

export function Kanban({
  puedeCrear,
  userId,
}: {
  puedeCrear: boolean;
  userId: string;
}) {
  const { tareas, mover, refetch } = useTareas();
  const [dialog, setDialog] = useState<ModoDialog>(null);
  const [activa, setActiva] = useState<TareaDTO | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({
    asignado: null,
    color: null,
    soloMias: false,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const visibles = useMemo(
    () =>
      tareas.filter((t) => {
        if (filtros.soloMias && t.asignadoA !== userId) return false;
        if (filtros.asignado && t.asignadoA !== filtros.asignado) return false;
        if (filtros.color && t.color !== filtros.color) return false;
        return true;
      }),
    [tareas, filtros, userId],
  );

  const porColumna = useMemo(() => {
    const m: Record<ColId, TareaDTO[]> = {
      por_hacer: [],
      en_proceso: [],
      terminada: [],
    };
    for (const t of visibles) m[t.columna].push(t);
    for (const col of COLUMNAS) m[col].sort((a, b) => a.orden - b.orden);
    return m;
  }, [visibles]);

  function onDragStart(e: DragStartEvent) {
    setActiva(tareas.find((t) => t.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiva(null);
    const { active, over } = e;
    if (!over) return;

    const arrastrada = tareas.find((t) => t.id === active.id);
    if (!arrastrada) return;

    const overId = String(over.id);
    const colDestino: ColId = overId.startsWith('col:')
      ? (overId.slice(4) as ColId)
      : (tareas.find((t) => t.id === over.id)?.columna ?? arrastrada.columna);

    const enDestino = porColumna[colDestino].filter((t) => t.id !== active.id);

    let orden: number;
    if (overId.startsWith('col:') || enDestino.length === 0) {
      orden = ordenEntre(enDestino.at(-1)?.orden ?? null, null);
    } else {
      const idxOver = enDestino.findIndex((t) => t.id === over.id);
      const antes = enDestino[idxOver - 1]?.orden ?? null;
      const objetivo = enDestino[idxOver]?.orden ?? null;
      // Si venía de más arriba en la misma columna, cae después del objetivo.
      const bajando =
        arrastrada.columna === colDestino && arrastrada.orden < (objetivo ?? Infinity);
      orden = bajando
        ? ordenEntre(objetivo, enDestino[idxOver + 1]?.orden ?? null)
        : ordenEntre(antes, objetivo);
    }

    if (colDestino === arrastrada.columna && orden === arrastrada.orden) return;

    void mover(active.id as string, { columna: colDestino, orden }).then((res) => {
      if (res?.documentoCreadoId) {
        setDialog(null);
        window.location.assign(`/documentos/${res.documentoCreadoId}`);
      }
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Tareas</h1>
        <FiltrosTareas value={filtros} onChange={setFiltros} />
        {puedeCrear && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setDialog({ tipo: 'crear' })}
          >
            <Plus className="size-4" /> Nueva tarea
          </Button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiva(null)}
      >
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-3">
          {COLUMNAS.map((col) => (
            <Columna
              key={col}
              id={col}
              tareas={porColumna[col]}
              onEditar={(t) => setDialog({ tipo: 'editar', tarea: t })}
            />
          ))}
        </div>
        <DragOverlay>
          {activa ? <Tarjeta tarea={activa} arrastrando /> : null}
        </DragOverlay>
      </DndContext>

      <DialogTarea
        modo={dialog}
        onOpenChange={(abierto) => !abierto && setDialog(null)}
        onCambio={() => void refetch()}
        userId={userId}
      />
    </div>
  );
}
