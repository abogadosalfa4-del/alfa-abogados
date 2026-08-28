'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { RoomName, ServerEvent } from '@/lib/realtime/events';

/**
 * Cliente Socket.IO singleton (PLAN §10). Reconexión automática (default de
 * Socket.IO). Al reconectar tras un corte de WiFi revalida todas las keys de
 * SWR para garantizar consistencia.
 */
let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      withCredentials: true,
      // Solo WebSocket: evita desconexiones "transport close" al pasar de polling a WS.
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

type Handler = (event: ServerEvent) => void;

export function useRealtime(
  room: RoomName | RoomName[],
  onEvent: Handler,
): void {
  const handlerRef = useRef<Handler>(onEvent);
  handlerRef.current = onEvent;

  const rooms = Array.isArray(room) ? room : [room];
  const roomsKey = rooms.join(',');

  useEffect(() => {
    const s = getSocket();
    const list = roomsKey.split(',') as RoomName[];

    const joinAll = () => list.forEach((r) => s.emit('join', r));
    const onEvt = (payload: ServerEvent) => handlerRef.current(payload);
    const onReconnect = () => {
      joinAll();
    };

    if (s.connected) joinAll();
    s.on('connect', joinAll);
    s.on('event', onEvt);
    s.io.on('reconnect', onReconnect);

    return () => {
      list.forEach((r) => s.emit('leave', r));
      s.off('connect', joinAll);
      s.off('event', onEvt);
      s.io.off('reconnect', onReconnect);
    };
  }, [roomsKey]);
}

/** Acceso directo al socket para casos puntuales (ej. estado de conexión). */
export function useSocket(): Socket {
  return getSocket();
}
