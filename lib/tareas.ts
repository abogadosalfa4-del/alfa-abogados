import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '@/lib/db';
import {
  causas,
  eventos,
  tareas,
  user,
  type Evento,
  type Tarea,
} from '@/lib/db/schema';
import { audit, computeDiff } from '@/lib/audit';
import { errores } from '@/lib/errores';
import { ORDEN_GAP, ordenEntre } from '@/lib/orden';
import { hoyISO } from '@/lib/fechas';

export { ordenEntre };
import {
  crearDocumentoDesdeTarea,
  marcarDocumentoEnviado,
} from '@/lib/documentos';
import { crearNotificacion } from '@/lib/notificaciones';
import {
  emitTareas,
  emitToAll,
  emitToUser,
} from '@/lib/realtime/socket-server';
import type {
  TareaCreate,
  TareaMover,
  TareaUpdate,
} from '@/lib/schemas/tarea';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;
type Columna = Tarea['columna'];

/** Siguiente `orden` fraccional al final de una columna (PLAN §7.3). */
export function ordenAlFinal(columna: Columna, exec: DbOrTx = db): number {
  const row = exec
    .select({ max: sql<number | null>`max(${tareas.orden})` })
    .from(tareas)
    .where(and(eq(tareas.columna, columna), isNull(tareas.deletedAt)))
    .get();
  return (row?.max ?? 0) + ORDEN_GAP;
}

/**
 * Encadenamiento evento→tarea (PLAN §4.3): al crear un evento `escrito` se crea
 * en la MISMA transacción una tarea en `por_hacer`.
 */
export function crearTareaEncadenada(
  tx: Tx,
  evento: Pick<Evento, 'id' | 'titulo' | 'fecha' | 'causaId' | 'creadoPor'>,
): string {
  const nowIso = new Date().toISOString();
  const id = uuidv7();
  tx.insert(tareas)
    .values({
      id,
      titulo: `Preparar: ${evento.titulo}`,
      descripcion: null,
      color: 'red',
      columna: 'por_hacer',
      orden: ordenAlFinal('por_hacer', tx),
      causaId: evento.causaId,
      eventoId: evento.id,
      asignadoA: null,
      creadoPor: evento.creadoPor,
      documentoId: null,
      fechaLimite: evento.fecha,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .run();
  audit(
    {
      userId: evento.creadoPor,
      entidad: 'tarea',
      entidadId: id,
      accion: 'create',
      diff: { origen: 'evento-escrito', eventoId: evento.id },
    },
    tx,
  );
  return id;
}

/**
 * Al cancelar un evento, la tarea vinculada pendiente se marca cancelada
 * (soft delete) — PLAN §4.3.
 */
export function cancelarTareasDeEvento(
  tx: Tx,
  eventoId: string,
  userId: string,
): string[] {
  const pendientes = tx
    .select({ id: tareas.id })
    .from(tareas)
    .where(
      and(
        eq(tareas.eventoId, eventoId),
        isNull(tareas.deletedAt),
        sql`${tareas.columna} <> 'terminada'`,
      ),
    )
    .all();

  const nowIso = new Date().toISOString();
  for (const t of pendientes) {
    tx.update(tareas)
      .set({ deletedAt: nowIso, updatedAt: nowIso })
      .where(eq(tareas.id, t.id))
      .run();
    audit(
      { userId, entidad: 'tarea', entidadId: t.id, accion: 'delete', diff: { motivo: 'evento-cancelado' } },
      tx,
    );
  }
  return pendientes.map((t) => t.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// DTO + servicio del tablero (PLAN §7)
// ─────────────────────────────────────────────────────────────────────────────

export type TareaDTO = Tarea & {
  causaNumero: string | null;
  asignadoNombre: string | null;
  tieneDocumento: boolean;
};

const selectDTO = {
  id: tareas.id,
  titulo: tareas.titulo,
  descripcion: tareas.descripcion,
  color: tareas.color,
  columna: tareas.columna,
  orden: tareas.orden,
  causaId: tareas.causaId,
  eventoId: tareas.eventoId,
  asignadoA: tareas.asignadoA,
  creadoPor: tareas.creadoPor,
  documentoId: tareas.documentoId,
  fechaLimite: tareas.fechaLimite,
  createdAt: tareas.createdAt,
  updatedAt: tareas.updatedAt,
  deletedAt: tareas.deletedAt,
  causaNumero: causas.numeroJuicio,
  asignadoNombre: user.name,
} as const;

function baseQuery() {
  return db
    .select(selectDTO)
    .from(tareas)
    .leftJoin(causas, eq(causas.id, tareas.causaId))
    .leftJoin(user, eq(user.id, tareas.asignadoA));
}

function toDTO(row: Omit<TareaDTO, 'tieneDocumento'>): TareaDTO {
  return { ...row, tieneDocumento: row.documentoId != null };
}

export function listarTareasVivas(): TareaDTO[] {
  return baseQuery()
    .where(isNull(tareas.deletedAt))
    .orderBy(tareas.columna, tareas.orden, desc(tareas.createdAt))
    .all()
    .map(toDTO);
}

export function obtenerTareaDTO(id: string): TareaDTO | undefined {
  const row = baseQuery().where(eq(tareas.id, id)).get();
  return row ? toDTO(row) : undefined;
}

function raw(id: string): Tarea | undefined {
  return db.select().from(tareas).where(eq(tareas.id, id)).get();
}

interface Actor {
  userId: string;
  role: string;
}

export function crearTarea(input: TareaCreate, actor: Actor): TareaDTO {
  const nowIso = new Date().toISOString();
  const id = uuidv7();
  db.transaction((tx) => {
    tx.insert(tareas)
      .values({
        id,
        titulo: input.titulo,
        descripcion: input.descripcion ?? null,
        color: input.color,
        columna: input.columna,
        orden: ordenAlFinal(input.columna, tx),
        causaId: input.causaId ?? null,
        eventoId: null,
        asignadoA: input.asignadoA ?? null,
        creadoPor: actor.userId,
        documentoId: null,
        fechaLimite: input.fechaLimite ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();
    audit(
      { userId: actor.userId, entidad: 'tarea', entidadId: id, accion: 'create', diff: input },
      tx,
    );
  });

  const dto = obtenerTareaDTO(id)!;
  emitTareas({ t: 'tarea:creada', tarea: dto });
  if (dto.asignadoA && dto.asignadoA !== actor.userId) {
    const notif = crearNotificacion({
      userId: dto.asignadoA,
      tipo: 'tarea-asignada',
      mensaje: `Te asignaron la tarea «${dto.titulo}»`,
      link: '/tareas',
    });
    emitToUser(dto.asignadoA, { t: 'notificacion', nivel: 'info', mensaje: notif.mensaje });
  }
  return dto;
}

/**
 * Crea una tarea generada por una automatización (motor de plazos, correos…).
 * No pasa por permisos de rol; el `creadoPor` es quien disparó la acción.
 */
export function crearTareaSuelta(
  input: {
    titulo: string;
    causaId?: string | null;
    fechaLimite?: string | null;
    color?: string;
  },
  creadoPor: string,
): TareaDTO {
  const nowIso = new Date().toISOString();
  const id = uuidv7();
  db.transaction((tx) => {
    tx.insert(tareas)
      .values({
        id,
        titulo: input.titulo,
        descripcion: null,
        color: input.color ?? 'amber',
        columna: 'por_hacer',
        orden: ordenAlFinal('por_hacer', tx),
        causaId: input.causaId ?? null,
        eventoId: null,
        asignadoA: null,
        creadoPor,
        documentoId: null,
        fechaLimite: input.fechaLimite ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();
    audit(
      { userId: creadoPor, entidad: 'tarea', entidadId: id, accion: 'create', diff: { origen: 'automatizacion', ...input } },
      tx,
    );
  });
  const dto = obtenerTareaDTO(id)!;
  emitTareas({ t: 'tarea:creada', tarea: dto });
  return dto;
}

export function actualizarTarea(id: string, patch: TareaUpdate, actor: Actor): TareaDTO {
  const actual = raw(id);
  if (!actual || actual.deletedAt) throw errores.noEncontrado('tarea');

  // PLAN §3: el asistente solo edita las tareas asignadas a sí mismo.
  if (
    actor.role === 'asistente' &&
    actual.asignadoA !== actor.userId
  ) {
    throw errores.sinPermiso();
  }

  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    const set: Partial<typeof tareas.$inferInsert> = { updatedAt: nowIso };
    if (patch.titulo !== undefined) set.titulo = patch.titulo;
    if (patch.descripcion !== undefined) set.descripcion = patch.descripcion ?? null;
    if (patch.color !== undefined) set.color = patch.color;
    if (patch.causaId !== undefined) set.causaId = patch.causaId ?? null;
    if (patch.asignadoA !== undefined) set.asignadoA = patch.asignadoA ?? null;
    if (patch.fechaLimite !== undefined) set.fechaLimite = patch.fechaLimite ?? null;
    tx.update(tareas).set(set).where(eq(tareas.id, id)).run();
    audit(
      {
        userId: actor.userId,
        entidad: 'tarea',
        entidadId: id,
        accion: 'update',
        diff: computeDiff(actual as Record<string, unknown>, set),
      },
      tx,
    );
  });

  const dto = obtenerTareaDTO(id)!;
  emitTareas({ t: 'tarea:actualizada', tarea: dto });
  if (
    patch.asignadoA &&
    patch.asignadoA !== actual.asignadoA &&
    patch.asignadoA !== actor.userId
  ) {
    const notif = crearNotificacion({
      userId: patch.asignadoA,
      tipo: 'tarea-asignada',
      mensaje: `Te asignaron la tarea «${dto.titulo}»`,
      link: '/tareas',
    });
    emitToUser(patch.asignadoA, { t: 'notificacion', nivel: 'info', mensaje: notif.mensaje });
  }
  return dto;
}

export interface ResultadoMovimiento {
  tarea: TareaDTO;
  /** Documento creado al pasar a "en proceso" por primera vez (PLAN §7.4). */
  documentoCreadoId?: string;
}

/**
 * Mueve una tarjeta (PLAN §7.2/§7.4). Cualquier rol puede mover columnas.
 * Automatizaciones:
 *   - a "en_proceso" 1ª vez sin documento  → crea documento vinculado
 *   - a "terminada" con documento vinculado → documento pasa a "enviado" +
 *     notificación a abogado/admin
 */
export function moverTarea(id: string, mov: TareaMover, actor: Actor): ResultadoMovimiento {
  const actual = raw(id);
  if (!actual || actual.deletedAt) throw errores.noEncontrado('tarea');

  const nowIso = new Date().toISOString();
  let documentoCreadoId: string | undefined;
  let documentoEnviado: { id: string; titulo: string } | undefined;

  db.transaction((tx) => {
    const set: Partial<typeof tareas.$inferInsert> = {
      columna: mov.columna,
      orden: mov.orden,
      updatedAt: nowIso,
    };

    if (
      mov.columna === 'en_proceso' &&
      actual.columna !== 'en_proceso' &&
      !actual.documentoId
    ) {
      const doc = crearDocumentoDesdeTarea(tx, {
        titulo: actual.titulo,
        tareaId: id,
        causaId: actual.causaId,
        creadoPor: actor.userId,
      });
      set.documentoId = doc.id;
      documentoCreadoId = doc.id;
    }

    if (mov.columna === 'terminada' && actual.documentoId) {
      const doc = marcarDocumentoEnviado(tx, actual.documentoId, actor.userId);
      if (doc && doc.estado === 'enviado') {
        documentoEnviado = { id: doc.id, titulo: doc.titulo };
      }
    }

    tx.update(tareas).set(set).where(eq(tareas.id, id)).run();
    audit(
      {
        userId: actor.userId,
        entidad: 'tarea',
        entidadId: id,
        accion: 'update',
        diff: { columna: [actual.columna, mov.columna], orden: [actual.orden, mov.orden] },
      },
      tx,
    );
  });

  const dto = obtenerTareaDTO(id)!;
  emitTareas({ t: 'tarea:movida', tarea: dto });

  if (documentoEnviado) {
    const actorNombre =
      db.select({ name: user.name }).from(user).where(eq(user.id, actor.userId)).get()?.name ??
      'Alguien';
    emitToAll({
      t: 'documento:enviado',
      documentoId: documentoEnviado.id,
      titulo: documentoEnviado.titulo,
      por: actorNombre,
    });
    crearNotificacion({
      userId: null,
      tipo: 'documento-enviado',
      mensaje: `${actorNombre} envió a revisión «${documentoEnviado.titulo}»`,
      link: `/documentos/${documentoEnviado.id}`,
    });
  }

  return { tarea: dto, documentoCreadoId };
}

export function eliminarTarea(id: string, actor: Actor): void {
  const actual = obtenerTareaDTO(id);
  if (!actual) throw errores.noEncontrado('tarea');
  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(tareas)
      .set({ deletedAt: nowIso, updatedAt: nowIso })
      .where(eq(tareas.id, id))
      .run();
    audit(
      { userId: actor.userId, entidad: 'tarea', entidadId: id, accion: 'delete' },
      tx,
    );
  });
  emitTareas({ t: 'tarea:eliminada', tarea: { ...actual, deletedAt: nowIso, updatedAt: nowIso } });
}

/** Renormaliza `orden` de una columna si hay gaps < 0.0001 (PLAN §7.3, cron). */
export function renormalizarOrden(): number {
  let tocadas = 0;
  for (const columna of ['por_hacer', 'en_proceso', 'terminada'] as const) {
    const filas = db
      .select({ id: tareas.id, orden: tareas.orden })
      .from(tareas)
      .where(and(eq(tareas.columna, columna), isNull(tareas.deletedAt)))
      .orderBy(tareas.orden)
      .all();
    let previo = -Infinity;
    let necesita = false;
    for (const f of filas) {
      if (f.orden - previo < 0.0001) necesita = true;
      previo = f.orden;
    }
    if (!necesita) continue;
    db.transaction((tx) => {
      filas.forEach((f, i) => {
        tx.update(tareas)
          .set({ orden: (i + 1) * ORDEN_GAP })
          .where(eq(tareas.id, f.id))
          .run();
        tocadas++;
      });
    });
  }
  return tocadas;
}

/** Quita tareas ligadas a eventos borrados o generadas por plazos ya invalidados. */
export function limpiarTareasObsoletas(): number {
  const nowIso = new Date().toISOString();
  const vivas = db
    .select({ id: tareas.id, titulo: tareas.titulo, eventoId: tareas.eventoId, fechaLimite: tareas.fechaLimite })
    .from(tareas)
    .where(isNull(tareas.deletedAt))
    .all();

  const eventosVivos = new Set(
    db
      .select({ id: eventos.id })
      .from(eventos)
      .where(isNull(eventos.deletedAt))
      .all()
      .map((e) => e.id),
  );

  let borradas = 0;
  db.transaction((tx) => {
    for (const t of vivas) {
      const eventoMuerto = t.eventoId != null && !eventosVivos.has(t.eventoId);
      const prepararHuerfana =
        !t.eventoId &&
        (t.titulo.startsWith('Preparar: Vence término apelación') ||
          t.titulo.startsWith('Preparar: Vence contestación'));
      const verificarPasada =
        t.titulo.startsWith('Verificar fecha de audiencia') &&
        t.fechaLimite != null &&
        t.fechaLimite < hoyISO();

      if (!eventoMuerto && !prepararHuerfana && !verificarPasada) continue;

      tx.update(tareas)
        .set({ deletedAt: nowIso, updatedAt: nowIso })
        .where(eq(tareas.id, t.id))
        .run();
      borradas++;
    }
  });
  return borradas;
}
