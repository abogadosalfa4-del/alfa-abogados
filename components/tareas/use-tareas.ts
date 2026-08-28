'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { apiMutate, fetcher } from '@/lib/api';
import { useRealtime } from '@/lib/realtime/socket-client';
import type { TareaDTO } from '@/lib/tareas';
import type { TareaMover } from '@/lib/schemas/tarea';

interface Respuesta {
  tareas: TareaDTO[];
}

const KEY = '/api/tareas';

/** Tablero en vivo (PLAN §7.2): SWR + socket room `tareas`, last-write-wins. */
export function useTareas() {
  const { data, isLoading, mutate } = useSWR<Respuesta>(KEY, fetcher, {
    revalidateOnFocus: false,
  });

  useRealtime('tareas', (ev) => {
    if (
      ev.t !== 'tarea:creada' &&
      ev.t !== 'tarea:movida' &&
      ev.t !== 'tarea:actualizada' &&
      ev.t !== 'tarea:eliminada'
    ) {
      return;
    }
    void mutate((prev) => reconciliar(prev?.tareas ?? [], ev), {
      revalidate: false,
    });
  });

  /** Mueve una tarjeta con UI optimista y rollback en caso de error. */
  const mover = useCallback(
    async (id: string, destino: TareaMover) => {
      const anterior = data?.tareas ?? [];
      const nowIso = new Date().toISOString();
      void mutate(
        {
          tareas: anterior.map((t) =>
            t.id === id
              ? { ...t, columna: destino.columna, orden: destino.orden, updatedAt: nowIso }
              : t,
          ),
        },
        { revalidate: false },
      );
      try {
        const res = await apiMutate<{ tarea: TareaDTO; documentoCreadoId?: string }>(
          `/api/tareas/${id}`,
          'PATCH',
          destino,
        );
        void mutate(
          (prev) => reconciliar(prev?.tareas ?? [], { t: 'tarea:movida', tarea: res.tarea }),
          { revalidate: false },
        );
        return res;
      } catch (err) {
        void mutate({ tareas: anterior }, { revalidate: true });
        toast.error(err instanceof Error ? err.message : 'No se pudo mover la tarjeta');
        return null;
      }
    },
    [data, mutate],
  );

  return {
    tareas: data?.tareas ?? [],
    isLoading,
    mover,
    refetch: () => mutate(),
  };
}

type Ev = {
  t: 'tarea:creada' | 'tarea:movida' | 'tarea:actualizada' | 'tarea:eliminada';
  tarea: TareaDTO;
};

function reconciliar(lista: TareaDTO[], ev: Ev): Respuesta {
  if (ev.t === 'tarea:eliminada') {
    return { tareas: lista.filter((t) => t.id !== ev.tarea.id) };
  }
  const idx = lista.findIndex((t) => t.id === ev.tarea.id);
  if (ev.tarea.deletedAt) {
    return { tareas: lista.filter((t) => t.id !== ev.tarea.id) };
  }
  if (idx === -1) return { tareas: [...lista, ev.tarea] };
  // last-write-wins por timestamp: descartar eventos más viejos que el estado
  if (new Date(ev.tarea.updatedAt) < new Date(lista[idx]!.updatedAt)) {
    return { tareas: lista };
  }
  const copia = lista.slice();
  copia[idx] = ev.tarea;
  return { tareas: copia };
}
