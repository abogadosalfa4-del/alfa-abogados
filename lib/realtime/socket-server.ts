import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { log } from '@/lib/logger';
import { resolverSesion } from '@/lib/auth-local';
import {
  ROOMS,
  userRoom,
  type ClientToServerEvents,
  type RoomName,
  type ServerEvent,
  type ServerToClientEvents,
  type SocketData,
} from '@/lib/realtime/events';

const logger = log('socket');

type TypedServer = IOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const globalForIO = globalThis as unknown as { __bufeteIO?: TypedServer };

const ALLOWED_ROOMS: readonly string[] = Object.values(ROOMS);

/**
 * Monta Socket.IO sobre el servidor HTTP compartido (PLAN §1.1 / §10).
 * Middleware de auth: valida la cookie de sesión de Better Auth; sin sesión,
 * la conexión se rechaza.
 */
export function setupSocketIO(httpServer: HttpServer): TypedServer {
  if (globalForIO.__bufeteIO) return globalForIO.__bufeteIO;

  const io: TypedServer = new IOServer(httpServer, {
    path: '/socket.io',
    serveClient: false,
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket, next) => {
    try {
      const cookie = socket.request.headers.cookie ?? '';
      const session = await resolverSesion(new Headers({ cookie }));
      if (!session?.user) {
        return next(new Error('no-session'));
      }
      socket.data.userId = session.user.id;
      socket.data.role = (session.user as { role?: string }).role ?? 'asistente';
      next();
    } catch (err) {
      logger.warn({ err }, 'fallo autenticando socket');
      next(new Error('auth-error'));
    }
  });

  io.on('connection', (socket: TypedSocket) => {
    const { userId } = socket.data;
    void socket.join(userRoom(userId));
    logger.debug({ userId, sid: socket.id }, 'socket conectado');

    socket.on('join', (room: RoomName) => {
      if (ALLOWED_ROOMS.includes(room)) void socket.join(room);
    });
    socket.on('leave', (room: RoomName) => {
      if (ALLOWED_ROOMS.includes(room)) void socket.leave(room);
    });
    socket.on('disconnect', (reason) => {
      logger.debug({ userId, sid: socket.id, reason }, 'socket desconectado');
    });
  });

  globalForIO.__bufeteIO = io;
  return io;
}

export function getIO(): TypedServer | null {
  return globalForIO.__bufeteIO ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Emisores tipados — se llaman desde los route handlers tras cada mutación.
// Si el socket aún no está montado (build, tests) hacen no-op.
// ─────────────────────────────────────────────────────────────────────────────

function emitToRoom(room: string, payload: ServerEvent): void {
  getIO()?.to(room).emit('event', payload);
}

export function emitCalendario(payload: Extract<ServerEvent, { t: `evento:${string}` }>): void {
  emitToRoom(ROOMS.calendario, payload);
}

export function emitTareas(payload: Extract<ServerEvent, { t: `tarea:${string}` }>): void {
  emitToRoom(ROOMS.tareas, payload);
}

export function emitCausas(payload: Extract<ServerEvent, { t: `causa:${string}` }>): void {
  emitToRoom(ROOMS.causas, payload);
}

export function emitToUser(userId: string, payload: ServerEvent): void {
  emitToRoom(userRoom(userId), payload);
}

export function emitToAll(payload: ServerEvent): void {
  getIO()?.emit('event', payload);
}

export function broadcastNotificacion(nivel: 'info' | 'warn', mensaje: string): void {
  emitToAll({ t: 'notificacion', nivel, mensaje });
}
