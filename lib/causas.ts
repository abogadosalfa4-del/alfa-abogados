import { createHash } from 'node:crypto';
import { and, asc, desc, eq, isNull, like, or } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '@/lib/db';
import {
  actuaciones,
  archivos,
  causas,
  clientes,
  eventos,
  partesProcesales,
  type Actuacion,
  type Causa,
} from '@/lib/db/schema';
import { audit, computeDiff } from '@/lib/audit';
import { errores } from '@/lib/errores';
import { log } from '@/lib/logger';
import {
  actuacionesJudiciales,
  buscarCausas,
  informacionJuicio,
} from '@/lib/sadje/client';
import { leerCache, guardarCache } from '@/lib/sadje/cache';
import { evaluarPlazos, limpiarEventosReglaInvalidos } from '@/lib/sadje/deadlines';
import { emitCausas, emitToUser } from '@/lib/realtime/socket-server';
import { compactarNumeroJuicio, formatearNumeroJuicio } from '@/lib/schemas/causa';
import { parsearNotificacionCasillero } from '@/lib/extraer-fecha';
import { hoyISO } from '@/lib/fechas';
import { asegurarClientePorNombre } from '@/lib/clientes';
import { esAbogadaOficina, nombrePocoFiable } from '@/lib/nombres';

const logger = log('causas');

function hashDetalle(detalle: string): string {
  return createHash('sha256')
    .update(detalle.normalize('NFD').replace(/\s+/g, ' ').trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

interface Actor {
  userId: string;
  role: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda local
// ─────────────────────────────────────────────────────────────────────────────

export interface CausaLista {
  id: string;
  numeroJuicio: string;
  materia: string | null;
  estado: string | null;
  origen: Causa['origen'];
  clienteNombre: string | null;
  ultimaSincronizacion: string | null;
}

export function buscarCausasLocal(q: string): CausaLista[] {
  const patron = `%${q}%`;
  const juicio = compactarNumeroJuicio(q);
  const dashed = juicio ? formatearNumeroJuicio(juicio) : null;
  return db
    .select({
      id: causas.id,
      numeroJuicio: causas.numeroJuicio,
      materia: causas.materia,
      estado: causas.estado,
      origen: causas.origen,
      clienteNombre: clientes.nombreCompleto,
      ultimaSincronizacion: causas.ultimaSincronizacion,
    })
    .from(causas)
    .leftJoin(clientes, eq(clientes.id, causas.clienteId))
    .where(
      and(
        isNull(causas.deletedAt),
        q
          ? or(
              like(causas.numeroJuicio, patron),
              dashed ? eq(causas.numeroJuicio, dashed) : undefined,
              like(clientes.nombreCompleto, patron),
              like(causas.materia, patron),
            )
          : undefined,
      ),
    )
    .orderBy(desc(causas.updatedAt))
    .limit(50)
    .all();
}

export function causaPorNumero(numeroJuicio: string): Causa | undefined {
  const compact = compactarNumeroJuicio(numeroJuicio);
  const dashed = compact ? formatearNumeroJuicio(compact) : numeroJuicio.trim().toUpperCase();
  return db
    .select()
    .from(causas)
    .where(
      and(
        isNull(causas.deletedAt),
        or(eq(causas.numeroJuicio, dashed), eq(causas.numeroJuicio, numeroJuicio.trim())),
      ),
    )
    .get();
}

// ─────────────────────────────────────────────────────────────────────────────
// Expediente
// ─────────────────────────────────────────────────────────────────────────────

export function expediente(id: string) {
  const causa = db
    .select({
      id: causas.id,
      numeroJuicio: causas.numeroJuicio,
      clienteId: causas.clienteId,
      clienteNombre: clientes.nombreCompleto,
      tipoAccion: causas.tipoAccion,
      materia: causas.materia,
      judicatura: causas.judicatura,
      estado: causas.estado,
      fechaIngreso: causas.fechaIngreso,
      origen: causas.origen,
      ultimaSincronizacion: causas.ultimaSincronizacion,
      createdAt: causas.createdAt,
    })
    .from(causas)
    .leftJoin(clientes, eq(clientes.id, causas.clienteId))
    .where(and(eq(causas.id, id), isNull(causas.deletedAt)))
    .get();
  if (!causa) return null;

  return {
    causa,
    partes: db
      .select()
      .from(partesProcesales)
      .where(and(eq(partesProcesales.causaId, id), isNull(partesProcesales.deletedAt)))
      .all(),
    actuaciones: db
      .select()
      .from(actuaciones)
      .where(and(eq(actuaciones.causaId, id), isNull(actuaciones.deletedAt)))
      .orderBy(desc(actuaciones.fecha))
      .all(),
    eventos: db
      .select()
      .from(eventos)
      .where(and(eq(eventos.causaId, id), isNull(eventos.deletedAt)))
      .orderBy(asc(eventos.fecha))
      .all(),
    archivos: db
      .select()
      .from(archivos)
      .where(and(eq(archivos.causaId, id), isNull(archivos.deletedAt)))
      .orderBy(desc(archivos.createdAt))
      .all(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Alta manual (PLAN §5.3)
// ─────────────────────────────────────────────────────────────────────────────

interface CrearManualInput {
  numeroJuicio: string;
  clienteId?: string | null;
  clienteNombre?: string | null;
  tipoAccion?: string | null;
  materia?: string | null;
  judicatura?: string | null;
  estado?: string | null;
  fechaIngreso?: string | null;
  partes: { tipo: 'actor' | 'demandado' | 'tercero'; nombre: string; representante?: string | null }[];
  actuaciones: { fecha: string; tipo: string; detalle: string; origen?: 'manual' | 'correo' }[];
}

export function crearCausaManual(input: CrearManualInput, actor: Actor): Causa {
  if (causaPorNumero(input.numeroJuicio)) {
    throw errores.conflicto(`Ya existe la causa ${input.numeroJuicio}.`);
  }
  const id = uuidv7();
  const nowIso = new Date().toISOString();

  const clienteIdResuelto =
    input.clienteId ??
    (input.clienteNombre?.trim() && !esAbogadaOficina(input.clienteNombre)
      ? asegurarClientePorNombre(input.clienteNombre)
      : null);

  db.transaction((tx) => {
    const clienteId = clienteIdResuelto;

    tx.insert(causas)
      .values({
        id,
        numeroJuicio: input.numeroJuicio,
        clienteId,
        tipoAccion: input.tipoAccion ?? null,
        materia: input.materia ?? null,
        judicatura: input.judicatura ?? null,
        estado: input.estado ?? null,
        fechaIngreso: input.fechaIngreso ?? null,
        origen: 'manual',
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();

    for (const p of input.partes) {
      tx.insert(partesProcesales)
        .values({
          id: uuidv7(),
          causaId: id,
          tipo: p.tipo,
          nombre: p.nombre,
          representante: p.representante ?? null,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .run();
    }
    for (const a of input.actuaciones) {
      tx.insert(actuaciones)
        .values({
          id: uuidv7(),
          causaId: id,
          fecha: a.fecha,
          tipo: a.tipo,
          detalle: a.detalle,
          detalleHash: hashDetalle(a.detalle),
          origen: a.origen ?? 'manual',
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .onConflictDoNothing()
        .run();
    }

    audit(
      { userId: actor.userId, entidad: 'causa', entidadId: id, accion: 'create', diff: { origen: 'manual', numeroJuicio: input.numeroJuicio } },
      tx,
    );
  });

  const causa = db.select().from(causas).where(eq(causas.id, id)).get()!;

  // Evaluar el motor de plazos sobre las actuaciones iniciales (§5.4).
  const actsCreadas = db
    .select()
    .from(actuaciones)
    .where(eq(actuaciones.causaId, id))
    .all();
  evaluarPlazos(causa, actsCreadas, actor.userId);
  limpiarEventosReglaInvalidos(id);

  emitCausas({ t: 'causa:sincronizada', causaId: id, nuevasActuaciones: input.actuaciones.length });
  return causa;
}

function materiaDesdeJudicatura(judicatura: string): string | null {
  const t = judicatura
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/familia|ninez|adolescen/.test(t)) return 'FAMILIA MUJER NIÑEZ Y ADOLESCENCIA';
  if (/violencia/.test(t)) return 'VIOLENCIA CONTRA LA MUJER Y FAMILIA';
  if (/penal/.test(t)) return 'PENAL';
  if (/laboral/.test(t)) return 'LABORAL';
  if (/civil/.test(t)) return 'CIVIL';
  return null;
}

/**
 * Crea o actualiza una causa a partir del texto del casillero electrónico
 * (cuando e-SATJE no publica el expediente o está caído).
 */
export function ingestarNotificacionCasillero(
  texto: string,
  actor: Actor,
  opts: { origenActuacion?: 'manual' | 'correo' } = {},
): { causa: Causa; creada: boolean } {
  const p = parsearNotificacionCasillero(texto);
  if (!p.numeroJuicio) {
    throw errores.validacion('No se reconoció un número de juicio en la notificación.');
  }
  const fecha = p.fecha || hoyISO();
  const origen = opts.origenActuacion ?? 'manual';
  const actuacion = { fecha, tipo: p.tipo || 'NOTIFICACIÓN', detalle: p.detalle, origen };
  const existente = causaPorNumero(p.numeroJuicio);

  if (existente) {
    const patch: Partial<Pick<Causa, 'clienteId' | 'judicatura' | 'estado' | 'materia'>> = {};
    if (existente.clienteId && clienteIdEsAbogada(existente.clienteId)) {
      patch.clienteId = p.cliente ? asegurarClientePorNombre(p.cliente) : null;
    } else if (p.cliente && !existente.clienteId) {
      patch.clienteId = asegurarClientePorNombre(p.cliente);
    }
    if (!existente.judicatura && p.judicatura) patch.judicatura = p.judicatura;
    if (!existente.estado && p.instancia) patch.estado = p.instancia;
    if (!existente.materia && p.judicatura) {
      patch.materia = materiaDesdeJudicatura(p.judicatura) ?? undefined;
    }
    if (Object.keys(patch).length > 0) actualizarCausa(existente.id, patch, actor);
    agregarActuacionManual(existente.id, actuacion, actor);
    return {
      causa: db.select().from(causas).where(eq(causas.id, existente.id)).get()!,
      creada: false,
    };
  }

  const causa = crearCausaManual(
    {
      numeroJuicio: p.numeroJuicio,
      clienteId: p.cliente ? asegurarClientePorNombre(p.cliente) : null,
      materia: materiaDesdeJudicatura(p.judicatura),
      judicatura: p.judicatura || null,
      estado: p.instancia || null,
      partes: p.cliente
        ? [
            {
              tipo: 'actor',
              nombre: p.cliente,
              representante: p.abogado || null,
            },
          ]
        : [],
      actuaciones: [actuacion],
    },
    actor,
  );
  return { causa, creada: true };
}

function clienteIdEsAbogada(clienteId: string): boolean {
  const n = db
    .select({ nombreCompleto: clientes.nombreCompleto })
    .from(clientes)
    .where(eq(clientes.id, clienteId))
    .get()?.nombreCompleto;
  return n ? esAbogadaOficina(n) : false;
}

/** Agrega una actuación manual y evalúa el motor de plazos (PLAN §5.3/§5.4). */
export function agregarActuacionManual(
  causaId: string,
  input: { fecha: string; tipo: string; detalle: string; origen?: 'manual' | 'correo' },
  actor: Actor,
): { eventosGenerados: number } {
  const causa = db.select().from(causas).where(eq(causas.id, causaId)).get();
  if (!causa || causa.deletedAt) throw errores.noEncontrado('causa');

  const id = uuidv7();
  const nowIso = new Date().toISOString();
  const nueva: typeof actuaciones.$inferInsert = {
    id,
    causaId,
    fecha: input.fecha,
    tipo: input.tipo,
    detalle: input.detalle,
    detalleHash: hashDetalle(input.detalle),
    origen: input.origen ?? 'manual',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.transaction((tx) => {
    tx.insert(actuaciones).values(nueva).onConflictDoNothing().run();
    audit(
      { userId: actor.userId, entidad: 'actuacion', entidadId: id, accion: 'create', diff: input },
      tx,
    );
  });

  const { eventosCreados } = evaluarPlazos(causa, [nueva as Actuacion], actor.userId);
  limpiarEventosReglaInvalidos(causaId);
  emitCausas({ t: 'causa:sincronizada', causaId, nuevasActuaciones: 1 });
  return { eventosGenerados: eventosCreados };
}

export function actualizarCausa(
  id: string,
  patch: Partial<Pick<Causa, 'clienteId' | 'tipoAccion' | 'materia' | 'judicatura' | 'estado'>>,
  actor: Actor,
): Causa {
  const actual = db.select().from(causas).where(eq(causas.id, id)).get();
  if (!actual || actual.deletedAt) throw errores.noEncontrado('causa');
  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(causas).set({ ...patch, updatedAt: nowIso }).where(eq(causas.id, id)).run();
    audit(
      { userId: actor.userId, entidad: 'causa', entidadId: id, accion: 'update', diff: computeDiff(actual as Record<string, unknown>, patch) },
      tx,
    );
  });
  return db.select().from(causas).where(eq(causas.id, id)).get()!;
}

export function eliminarCausa(id: string, actor: Actor): void {
  const actual = db.select().from(causas).where(eq(causas.id, id)).get();
  if (!actual || actual.deletedAt) throw errores.noEncontrado('causa');
  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(causas).set({ deletedAt: nowIso, updatedAt: nowIso }).where(eq(causas.id, id)).run();
    audit({ userId: actor.userId, entidad: 'causa', entidadId: id, accion: 'delete' }, tx);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sincronización con e-SATJE (PLAN §5.2 / §5.4). Corre en la cola p-queue.
// ─────────────────────────────────────────────────────────────────────────────

export async function sincronizarCausa(
  causaId: string,
  actor: Actor,
  opts: { ignorarCache?: boolean; idJuicioSadje?: string } = {},
): Promise<{ nuevasActuaciones: number; eventosGenerados: number }> {
  const causa = db.select().from(causas).where(eq(causas.id, causaId)).get();
  if (!causa || causa.deletedAt) throw errores.noEncontrado('causa');

  const claveDetalle = `causa:${causa.numeroJuicio}`;
  let idJuicio = opts.idJuicioSadje;

  if (!idJuicio) {
    const cacheBusqueda = !opts.ignorarCache
      ? leerCache<{ idJuicio: string }>(`busqueda:${causa.numeroJuicio}`)
      : null;
    if (cacheBusqueda) {
      idJuicio = cacheBusqueda.idJuicio;
    } else {
      const encontradas = await buscarCausas({ numeroCausa: causa.numeroJuicio });
      const match = encontradas.find((c) => c.numeroJuicio === causa.numeroJuicio) ?? encontradas[0];
      if (!match) {
        throw errores.noEncontrado(`la causa ${causa.numeroJuicio} en e-SATJE`);
      }
      idJuicio = match.idJuicio;
      guardarCache(`busqueda:${causa.numeroJuicio}`, { idJuicio });
    }
  }

  const cacheDetalle = !opts.ignorarCache
    ? leerCache<{ detalle: unknown; actuaciones: unknown }>(claveDetalle)
    : null;

  const detalle = cacheDetalle
    ? (cacheDetalle.detalle as Awaited<ReturnType<typeof informacionJuicio>>)
    : await informacionJuicio(idJuicio);
  const acts = cacheDetalle
    ? (cacheDetalle.actuaciones as Awaited<ReturnType<typeof actuacionesJudiciales>>)
    : await actuacionesJudiciales({ idJuicio, numeroJuicio: causa.numeroJuicio });

  if (!cacheDetalle) {
    guardarCache(claveDetalle, { detalle, actuaciones: acts });
  }

  const nowIso = new Date().toISOString();
  const nuevas: Actuacion[] = [];

  db.transaction((tx) => {
    // Merge solo-agregar: nunca sobrescribe campos editados manualmente (§5.3).
    const set: Partial<typeof causas.$inferInsert> = {
      ultimaSincronizacion: nowIso,
      updatedAt: nowIso,
    };
    if (causa.origen === 'sadje' || !causa.materia) set.materia = detalle.materia || causa.materia;
    if (causa.origen === 'sadje' || !causa.tipoAccion) set.tipoAccion = detalle.tipoAccion || causa.tipoAccion;
    if (causa.origen === 'sadje' || !causa.judicatura) set.judicatura = detalle.judicatura || causa.judicatura;
    if (causa.origen === 'sadje' || !causa.estado) set.estado = detalle.estado || causa.estado;
    if (causa.origen === 'sadje' || !causa.fechaIngreso) set.fechaIngreso = detalle.fechaIngreso || causa.fechaIngreso;
    tx.update(causas).set(set).where(eq(causas.id, causaId)).run();

    // Partes: agregar las que no existan (por tipo+nombre).
    const existentes = tx
      .select({ tipo: partesProcesales.tipo, nombre: partesProcesales.nombre })
      .from(partesProcesales)
      .where(eq(partesProcesales.causaId, causaId))
      .all();
    const clave = (t: string, n: string) => `${t}::${n.trim().toLowerCase()}`;
    const set2 = new Set(existentes.map((p) => clave(p.tipo, p.nombre)));
    for (const p of detalle.partes) {
      if (!p.nombre || set2.has(clave(p.tipo, p.nombre))) continue;
      tx.insert(partesProcesales)
        .values({
          id: uuidv7(),
          causaId,
          tipo: p.tipo === 'actor' || p.tipo === 'demandado' ? p.tipo : 'tercero',
          nombre: p.nombre,
          representante: p.representante || null,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .run();
    }

    // Actuaciones: dedup por UNIQUE(causa_id, fecha, tipo, detalle_hash).
    for (const a of acts) {
      const hash = hashDetalle(a.detalle);
      const yaEsta = tx
        .select({ id: actuaciones.id })
        .from(actuaciones)
        .where(
          and(
            eq(actuaciones.causaId, causaId),
            eq(actuaciones.fecha, a.fecha),
            eq(actuaciones.tipo, a.tipo),
            eq(actuaciones.detalleHash, hash),
          ),
        )
        .get();
      if (yaEsta) continue;
      const nueva: typeof actuaciones.$inferInsert = {
        id: uuidv7(),
        causaId,
        fecha: a.fecha,
        tipo: a.tipo,
        detalle: a.detalle,
        detalleHash: hash,
        origen: 'sadje',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      tx.insert(actuaciones).values(nueva).onConflictDoNothing().run();
      nuevas.push(nueva as Actuacion);
    }

    audit(
      { userId: actor.userId, entidad: 'causa', entidadId: causaId, accion: 'update', diff: { sincronizada: true, nuevasActuaciones: nuevas.length } },
      tx,
    );
  });

  let causaActualizada = db.select().from(causas).where(eq(causas.id, causaId)).get()!;
  if (!causaActualizada.clienteId || clienteIdEsAbogada(causaActualizada.clienteId)) {
    const actorParte = detalle.partes.find(
      (p) =>
        p.tipo === 'actor' &&
        Boolean(p.nombre) &&
        !esAbogadaOficina(p.nombre) &&
        !nombrePocoFiable(p.nombre),
    );
    if (actorParte?.nombre) {
      actualizarCausa(
        causaId,
        { clienteId: asegurarClientePorNombre(actorParte.nombre) },
        actor,
      );
      causaActualizada = db.select().from(causas).where(eq(causas.id, causaId)).get()!;
    }
  }

  const { eventosCreados } = evaluarPlazos(causaActualizada, nuevas, actor.userId);
  limpiarEventosReglaInvalidos(causaId);

  emitCausas({ t: 'causa:sincronizada', causaId, nuevasActuaciones: nuevas.length });
  emitToUser(actor.userId, {
    t: 'sadje:resultado',
    jobId: causaId,
    ok: true,
    data: { nuevasActuaciones: nuevas.length, eventosGenerados: eventosCreados },
  });

  logger.info(
    { causa: causa.numeroJuicio, nuevas: nuevas.length, eventos: eventosCreados },
    'causa sincronizada',
  );
  return { nuevasActuaciones: nuevas.length, eventosGenerados: eventosCreados };
}

/** Crea una causa a partir de un resultado de búsqueda SADJE y la sincroniza. */
export async function importarCausaSadje(
  resumen: {
    idJuicio: string;
    numeroJuicio: string;
    estado: string;
    materia: string;
    tipoAccion: string;
    judicatura: string;
    fechaIngreso: string;
  },
  clienteId: string | null,
  actor: Actor,
): Promise<Causa> {
  const existente = causaPorNumero(resumen.numeroJuicio);
  if (existente) {
    await sincronizarCausa(existente.id, actor, { ignorarCache: true, idJuicioSadje: resumen.idJuicio });
    return db.select().from(causas).where(eq(causas.id, existente.id)).get()!;
  }
  const id = uuidv7();
  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    tx.insert(causas)
      .values({
        id,
        numeroJuicio: resumen.numeroJuicio,
        clienteId,
        tipoAccion: resumen.tipoAccion || null,
        materia: resumen.materia || null,
        judicatura: resumen.judicatura || null,
        estado: resumen.estado || null,
        fechaIngreso: resumen.fechaIngreso || null,
        origen: 'sadje',
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();
    audit(
      { userId: actor.userId, entidad: 'causa', entidadId: id, accion: 'create', diff: { origen: 'sadje', numeroJuicio: resumen.numeroJuicio } },
      tx,
    );
  });
  await sincronizarCausa(id, actor, { ignorarCache: true, idJuicioSadje: resumen.idJuicio });
  return db.select().from(causas).where(eq(causas.id, id)).get()!;
}
