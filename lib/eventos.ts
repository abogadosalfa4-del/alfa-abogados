import { and, asc, between, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { uuidv7 } from 'uuidv7';
import { db } from '@/lib/db';
import { causas, clientes, eventos, type Evento } from '@/lib/db/schema';
import { audit, computeDiff } from '@/lib/audit';
import { errores } from '@/lib/errores';
import { inferirEtiqueta, type EtiquetaEvento } from '@/lib/etiquetas-evento';
import { hoyISO, toYmd, fromYmd, addDays } from '@/lib/fechas';
import {
  crearTareaEncadenada,
  cancelarTareasDeEvento,
  obtenerTareaDTO,
} from '@/lib/tareas';
import { emitCalendario, emitTareas } from '@/lib/realtime/socket-server';
import type { EventoCreate, EventoUpdate } from '@/lib/schemas/evento';

const clienteDelEvento = alias(clientes, 'cliente_evento');
const clienteDeLaCausa = alias(clientes, 'cliente_causa');

/** Evento + etiquetas de sus vínculos (para chips y panel «próximos»). */
export type EventoDTO = Evento & {
  causaNumero: string | null;
  clienteNombre: string | null;
  judicatura: string | null;
  materia: string | null;
  etiqueta: EtiquetaEvento;
};

const selectDTO = {
  id: eventos.id,
  tipo: eventos.tipo,
  titulo: eventos.titulo,
  descripcion: eventos.descripcion,
  fecha: eventos.fecha,
  hora: eventos.hora,
  causaId: eventos.causaId,
  clienteId: sql<string | null>`coalesce(${eventos.clienteId}, ${causas.clienteId})`,
  origen: eventos.origen,
  reglaId: eventos.reglaId,
  correoOrigenId: eventos.correoOrigenId,
  estado: eventos.estado,
  creadoPor: eventos.creadoPor,
  createdAt: eventos.createdAt,
  updatedAt: eventos.updatedAt,
  deletedAt: eventos.deletedAt,
  causaNumero: causas.numeroJuicio,
  clienteNombre: sql<string | null>`coalesce(${clienteDelEvento.nombreCompleto}, ${clienteDeLaCausa.nombreCompleto})`,
  judicatura: causas.judicatura,
  materia: causas.materia,
};

function baseQuery() {
  return db
    .select(selectDTO)
    .from(eventos)
    .leftJoin(causas, eq(causas.id, eventos.causaId))
    .leftJoin(clienteDelEvento, eq(clienteDelEvento.id, eventos.clienteId))
    .leftJoin(clienteDeLaCausa, eq(clienteDeLaCausa.id, causas.clienteId));
}

function asDTO(
  row: Omit<EventoDTO, 'etiqueta'>,
): EventoDTO {
  return {
    ...row,
    etiqueta: inferirEtiqueta(`${row.titulo} ${row.descripcion ?? ''}`, row.tipo),
  };
}

export function listarEventos(desde: string, hasta: string): EventoDTO[] {
  return baseQuery()
    .where(and(isNull(eventos.deletedAt), between(eventos.fecha, desde, hasta)))
    .orderBy(asc(eventos.fecha), asc(eventos.hora))
    .all()
    .map(asDTO);
}

export function proximosEventos(dias = 7): EventoDTO[] {
  const desde = hoyISO();
  const hasta = toYmd(addDays(fromYmd(desde), dias));
  return baseQuery()
    .where(
      and(
        isNull(eventos.deletedAt),
        gte(eventos.fecha, desde),
        lte(eventos.fecha, hasta),
        eq(eventos.estado, 'pendiente'),
      ),
    )
    .orderBy(asc(eventos.fecha), asc(eventos.hora))
    .all()
    .map(asDTO);
}

export function obtenerEvento(id: string): EventoDTO | undefined {
  const row = baseQuery()
    .where(and(eq(eventos.id, id), isNull(eventos.deletedAt)))
    .get();
  return row ? asDTO(row) : undefined;
}

function raw(id: string): Evento | undefined {
  return db.select().from(eventos).where(eq(eventos.id, id)).get();
}

function causaViva(id: string): { id: string; clienteId: string | null } | undefined {
  return db
    .select({ id: causas.id, clienteId: causas.clienteId })
    .from(causas)
    .where(and(eq(causas.id, id), isNull(causas.deletedAt)))
    .get();
}

function clienteDeCausa(causaId: string): string | null {
  return causaViva(causaId)?.clienteId ?? null;
}

interface Actor {
  userId: string;
}

interface CrearOpts {
  origen?: Evento['origen'];
  reglaId?: string | null;
  correoOrigenId?: string | null;
}

/**
 * Crea un evento (PLAN §4.2/§4.3). Si es `escrito`, en la misma transacción
 * crea la tarea encadenada. Emite por socket tras el commit.
 */
export function crearEvento(
  input: EventoCreate,
  actor: Actor,
  opts: CrearOpts = {},
): EventoDTO {
  const causa = causaViva(input.causaId);
  if (!causa) {
    throw errores.validacion('El evento debe estar vinculado a un número de juicio.');
  }
  const clienteId = input.clienteId ?? causa.clienteId ?? null;

  const nowIso = new Date().toISOString();
  const id = uuidv7();

  const tareaId = db.transaction((tx) => {
    const fila: typeof eventos.$inferInsert = {
      id,
      tipo: input.tipo,
      titulo: input.titulo,
      descripcion: input.descripcion ?? null,
      fecha: input.fecha,
      hora: input.hora ?? null,
      causaId: causa.id,
      clienteId,
      origen: opts.origen ?? 'manual',
      reglaId: opts.reglaId ?? null,
      correoOrigenId: opts.correoOrigenId ?? null,
      estado: 'pendiente',
      creadoPor: actor.userId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    tx.insert(eventos).values(fila).run();
    audit(
      { userId: actor.userId, entidad: 'evento', entidadId: id, accion: 'create', diff: fila },
      tx,
    );
    const creado = tx.select().from(eventos).where(eq(eventos.id, id)).get()!;
    return creado.tipo === 'escrito'
      ? crearTareaEncadenada(tx, creado)
      : undefined;
  });

  const dto = obtenerEvento(id)!;
  emitCalendario({ t: 'evento:creado', evento: dto });
  if (tareaId) {
    const tarea = obtenerTareaDTO(tareaId);
    if (tarea) emitTareas({ t: 'tarea:creada', tarea });
  }
  return dto;
}

export function actualizarEvento(
  id: string,
  patch: EventoUpdate,
  actor: Actor,
): EventoDTO {
  const actual = raw(id);
  if (!actual || actual.deletedAt) throw errores.noEncontrado('evento');

  if (patch.causaId === null) {
    throw errores.validacion('El evento debe tener un número de juicio.');
  }
  if (patch.causaId) {
    if (!causaViva(patch.causaId)) {
      throw errores.validacion('La causa vinculada no existe.');
    }
  }

  const nowIso = new Date().toISOString();

  const canceladas = db.transaction((tx) => {
    const set: Partial<typeof eventos.$inferInsert> = { updatedAt: nowIso };
    if (patch.tipo !== undefined) set.tipo = patch.tipo;
    if (patch.titulo !== undefined) set.titulo = patch.titulo;
    if (patch.descripcion !== undefined) set.descripcion = patch.descripcion ?? null;
    if (patch.fecha !== undefined) set.fecha = patch.fecha;
    if (patch.hora !== undefined) set.hora = patch.hora ?? null;
    if (patch.causaId !== undefined) set.causaId = patch.causaId;
    if (patch.clienteId !== undefined) set.clienteId = patch.clienteId ?? null;
    if (patch.estado !== undefined) set.estado = patch.estado;

    const causaIdFinal = patch.causaId !== undefined ? patch.causaId : actual.causaId;
    const clienteIdFinal =
      patch.clienteId !== undefined ? patch.clienteId : (set.clienteId ?? actual.clienteId);
    if (causaIdFinal && !clienteIdFinal) {
      set.clienteId = clienteDeCausa(causaIdFinal);
    }

    tx.update(eventos).set(set).where(eq(eventos.id, id)).run();
    audit(
      {
        userId: actor.userId,
        entidad: 'evento',
        entidadId: id,
        accion: 'update',
        diff: computeDiff(actual as Record<string, unknown>, set),
      },
      tx,
    );
    return patch.estado === 'cancelado'
      ? cancelarTareasDeEvento(tx, id, actor.userId)
      : [];
  });

  const dto = obtenerEvento(id)!;
  emitCalendario({ t: 'evento:actualizado', evento: dto });
  for (const tid of canceladas) {
    const tarea = obtenerTareaDTO(tid);
    if (tarea) emitTareas({ t: 'tarea:eliminada', tarea });
  }
  return dto;
}

export function eliminarEvento(id: string, actor: Actor): void {
  const actual = obtenerEvento(id);
  if (!actual) throw errores.noEncontrado('evento');

  const nowIso = new Date().toISOString();
  const canceladas = db.transaction((tx) => {
    tx.update(eventos)
      .set({ deletedAt: nowIso, updatedAt: nowIso })
      .where(eq(eventos.id, id))
      .run();
    audit(
      { userId: actor.userId, entidad: 'evento', entidadId: id, accion: 'delete' },
      tx,
    );
    return cancelarTareasDeEvento(tx, id, actor.userId);
  });

  emitCalendario({
    t: 'evento:eliminado',
    evento: { ...actual, deletedAt: nowIso, updatedAt: nowIso },
  });
  for (const tid of canceladas) {
    const tarea = obtenerTareaDTO(tid);
    if (tarea) emitTareas({ t: 'tarea:eliminada', tarea });
  }
}
