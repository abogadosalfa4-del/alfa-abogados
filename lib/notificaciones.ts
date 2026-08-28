import { and, between, desc, eq, isNull, or } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '@/lib/db';
import {
  clientes,
  eventos,
  notificaciones,
  type Notificacion,
} from '@/lib/db/schema';
import { hoyISO, toYmd, fromYmd } from '@/lib/fechas';
import { sumarDiasHabiles } from '@/lib/feriados';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

/**
 * Notificaciones internas (PLAN §11). Persisten en tabla; la campana del header
 * las lista. `userId = null` => broadcast a todos.
 */
export function crearNotificacion(
  params: { userId: string | null; tipo: string; mensaje: string; link?: string | null },
  exec: Exec = db,
): Notificacion {
  const id = uuidv7();
  const nowIso = new Date().toISOString();
  exec
    .insert(notificaciones)
    .values({
      id,
      userId: params.userId,
      tipo: params.tipo,
      mensaje: params.mensaje,
      link: params.link ?? null,
      leida: false,
      createdAt: nowIso,
    })
    .run();
  return {
    id,
    userId: params.userId,
    tipo: params.tipo,
    mensaje: params.mensaje,
    link: params.link ?? null,
    leida: false,
    createdAt: nowIso,
  };
}

export function listarNotificaciones(userId: string, limite = 30): Notificacion[] {
  return db
    .select()
    .from(notificaciones)
    .where(or(eq(notificaciones.userId, userId), isNull(notificaciones.userId)))
    .orderBy(desc(notificaciones.createdAt))
    .limit(limite)
    .all();
}

/**
 * Aviso diario (PLAN §11): escritos pendientes que vencen en ≤3 días hábiles.
 * Dedup por `tipo = venc:<eventoId>`. Devuelve cuántos avisos nuevos creó.
 */
export function notificarVencimientosProximos(): number {
  const desde = hoyISO();
  const hasta = sumarDiasHabiles(toYmd(fromYmd(desde)), 3);

  const proximos = db
    .select({
      id: eventos.id,
      titulo: eventos.titulo,
      fecha: eventos.fecha,
      cliente: clientes.nombreCompleto,
    })
    .from(eventos)
    .leftJoin(clientes, eq(clientes.id, eventos.clienteId))
    .where(
      and(
        eq(eventos.tipo, 'escrito'),
        eq(eventos.estado, 'pendiente'),
        isNull(eventos.deletedAt),
        between(eventos.fecha, desde, hasta),
      ),
    )
    .all();

  let creadas = 0;
  for (const e of proximos) {
    const tipo = `venc:${e.id}`;
    const yaAvisado = db
      .select({ id: notificaciones.id })
      .from(notificaciones)
      .where(eq(notificaciones.tipo, tipo))
      .get();
    if (yaAvisado) continue;
    crearNotificacion({
      userId: null,
      tipo,
      mensaje: `Vence pronto (${e.fecha}): ${e.titulo}${e.cliente ? ` — ${e.cliente}` : ''}`,
      link: '/calendario',
    });
    creadas++;
  }
  return creadas;
}

export function marcarTodasLeidas(userId: string): void {
  db.update(notificaciones)
    .set({ leida: true })
    .where(
      and(
        or(eq(notificaciones.userId, userId), isNull(notificaciones.userId)),
        eq(notificaciones.leida, false),
      ),
    )
    .run();
}
