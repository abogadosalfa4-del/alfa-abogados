import type { EventoDTO } from '@/lib/eventos';
import type { TareaDTO } from '@/lib/tareas';

/**
 * Contrato de tiempo real (PLAN §10). Union compartida cliente/servidor.
 * El servidor emite `ServerEvent`; el cliente escucha por `room`.
 */
export type ServerEvent =
  | { t: 'evento:creado' | 'evento:actualizado' | 'evento:eliminado'; evento: EventoDTO }
  | {
      t: 'tarea:creada' | 'tarea:movida' | 'tarea:actualizada' | 'tarea:eliminada';
      tarea: TareaDTO;
    }
  | { t: 'causa:sincronizada'; causaId: string; nuevasActuaciones: number }
  | { t: 'sadje:resultado'; jobId: string; ok: boolean; data?: unknown; error?: string }
  | { t: 'rag:progreso'; archivoId: string; pct: number }
  | { t: 'documento:enviado'; documentoId: string; titulo: string; por: string }
  | { t: 'notificacion'; nivel: 'info' | 'warn'; mensaje: string };

export type ServerEventType = ServerEvent['t'];

/** Salas de Socket.IO. `user:<id>` es privada por usuario. */
export const ROOMS = {
  calendario: 'calendario',
  tareas: 'tareas',
  causas: 'causas',
} as const;

export type RoomName = (typeof ROOMS)[keyof typeof ROOMS] | `user:${string}`;

export function userRoom(userId: string): `user:${string}` {
  return `user:${userId}`;
}

/** Eventos que el cliente puede emitir al servidor. */
export interface ClientToServerEvents {
  join: (room: RoomName) => void;
  leave: (room: RoomName) => void;
}

export interface ServerToClientEvents {
  event: (payload: ServerEvent) => void;
}

export interface SocketData {
  userId: string;
  role: string;
}
