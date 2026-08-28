import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '@/lib/db';
import { conversaciones, mensajes } from '@/lib/db/schema';
import { audit } from '@/lib/audit';

export interface MensajePersistido {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: unknown;
}

export function listarConversaciones(userId: string) {
  return db
    .select({
      id: conversaciones.id,
      titulo: conversaciones.titulo,
      causaId: conversaciones.causaId,
      updatedAt: conversaciones.updatedAt,
    })
    .from(conversaciones)
    .where(and(eq(conversaciones.userId, userId), isNull(conversaciones.deletedAt)))
    .orderBy(desc(conversaciones.updatedAt))
    .all();
}

export function crearConversacion(
  userId: string,
  input: { titulo?: string; causaId?: string | null },
) {
  const id = uuidv7();
  const nowIso = new Date().toISOString();
  db.insert(conversaciones)
    .values({
      id,
      titulo: input.titulo?.trim() || 'Nueva conversación',
      causaId: input.causaId ?? null,
      userId,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .run();
  return { id, titulo: input.titulo?.trim() || 'Nueva conversación', causaId: input.causaId ?? null };
}

export function obtenerConversacion(id: string, userId: string) {
  return db
    .select()
    .from(conversaciones)
    .where(
      and(
        eq(conversaciones.id, id),
        eq(conversaciones.userId, userId),
        isNull(conversaciones.deletedAt),
      ),
    )
    .get();
}

export function mensajesDe(conversacionId: string): MensajePersistido[] {
  return db
    .select()
    .from(mensajes)
    .where(eq(mensajes.conversacionId, conversacionId))
    .orderBy(asc(mensajes.createdAt))
    .all()
    .map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.partsJson,
    }));
}

/** Reemplaza el historial de la conversación (se llama en `onFinish`). */
export function guardarMensajes(
  conversacionId: string,
  msgs: { role: 'user' | 'assistant' | 'system'; parts: unknown }[],
): void {
  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    tx.delete(mensajes).where(eq(mensajes.conversacionId, conversacionId)).run();
    msgs.forEach((m, i) => {
      tx.insert(mensajes)
        .values({
          id: uuidv7(),
          conversacionId,
          role: m.role,
          partsJson: m.parts as object,
          createdAt: new Date(Date.parse(nowIso) + i).toISOString(),
        })
        .run();
    });
    tx.update(conversaciones)
      .set({ updatedAt: nowIso })
      .where(eq(conversaciones.id, conversacionId))
      .run();
  });
}

export function renombrarConversacion(id: string, userId: string, titulo: string): void {
  db.update(conversaciones)
    .set({ titulo: titulo.slice(0, 120), updatedAt: new Date().toISOString() })
    .where(and(eq(conversaciones.id, id), eq(conversaciones.userId, userId)))
    .run();
}

export function eliminarConversacion(id: string, userId: string): void {
  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(conversaciones)
      .set({ deletedAt: nowIso, updatedAt: nowIso })
      .where(and(eq(conversaciones.id, id), eq(conversaciones.userId, userId)))
      .run();
    audit({ userId, entidad: 'conversacion', entidadId: id, accion: 'delete' }, tx);
  });
}
