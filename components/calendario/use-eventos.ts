'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { useRealtime } from '@/lib/realtime/socket-client';
import type { ServerEvent } from '@/lib/realtime/events';
import type { EventoDTO } from '@/lib/eventos';

interface Respuesta {
  eventos: EventoDTO[];
}

/**
 * Eventos del rango visible (PLAN §4.1). SWR + reconciliación por socket:
 * los cambios de otros usuarios llegan por la sala `calendario` y se aplican
 * al caché (last-write-wins por `updatedAt`). Sin polling.
 */
export function useEventos(desde: string, hasta: string) {
  const key = `/api/eventos?desde=${desde}&hasta=${hasta}`;
  const { data, error, isLoading, mutate } = useSWR<Respuesta>(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const dentroDelRango = useCallback(
    (fecha: string) => fecha >= desde && fecha <= hasta,
    [desde, hasta],
  );

  useRealtime('calendario', (ev: ServerEvent) => {
    if (ev.t !== 'evento:creado' && ev.t !== 'evento:actualizado' && ev.t !== 'evento:eliminado') {
      return;
    }
    void mutate((prev) => {
      const lista = prev?.eventos ?? [];
      if (ev.t === 'evento:eliminado') {
        return { eventos: lista.filter((e) => e.id !== ev.evento.id) };
      }
      if (!dentroDelRango(ev.evento.fecha)) {
        return { eventos: lista.filter((e) => e.id !== ev.evento.id) };
      }
      const idx = lista.findIndex((e) => e.id === ev.evento.id);
      if (idx === -1) return { eventos: [...lista, ev.evento] };
      // last-write-wins por timestamp
      if (
        lista[idx] &&
        new Date(ev.evento.updatedAt) < new Date(lista[idx].updatedAt)
      ) {
        return prev;
      }
      const copia = lista.slice();
      copia[idx] = ev.evento;
      return { eventos: copia };
    }, { revalidate: false });
  });

  return {
    eventos: data?.eventos ?? [],
    error,
    isLoading,
    refetch: () => mutate(),
  };
}
