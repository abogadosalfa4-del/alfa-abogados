import { and, asc, desc, eq, inArray, isNull, like, or } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '@/lib/db';
import {
  actuaciones,
  archivos,
  causas,
  clientes,
  correosCasillero,
  eventos,
  partesProcesales,
} from '@/lib/db/schema';
import { compactarNumeroJuicio, formatearNumeroJuicio } from '@/lib/schemas/causa';
import { parsearNotificacionCasillero } from '@/lib/extraer-fecha';
import { esAbogadaOficina, esMismaPersona, nombrePocoFiable, tokensNombre } from '@/lib/nombres';

export interface CausaEnCliente {
  id: string;
  numeroJuicio: string;
  materia: string | null;
  estado: string | null;
  origen: 'sadje' | 'manual';
  ultimaSincronizacion: string | null;
  createdAt: string;
}

export interface ClienteLista {
  id: string;
  nombre: string;
  nCausas: number;
  nActuaciones: number;
  primeraFecha: string;
  ultimaActividad: string | null;
  causas: CausaEnCliente[];
}

export interface ListaAgrupada {
  clientes: ClienteLista[];
  sinCliente: CausaEnCliente[];
}

function claveNombre(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ');
}

/** Reusa el cliente si el nombre coincide (orden de apellidos da igual). */
export function asegurarClientePorNombre(nombre: string): string {
  const nowIso = new Date().toISOString();
  const clave = claveNombre(nombre);
  if (!clave) throw new Error('Nombre de cliente vacío');
  if (esAbogadaOficina(clave)) {
    throw new Error('La abogada del estudio no se registra como cliente.');
  }

  const todos = db
    .select({ id: clientes.id, nombreCompleto: clientes.nombreCompleto })
    .from(clientes)
    .where(isNull(clientes.deletedAt))
    .all();

  const match = todos.find(
    (c) =>
      c.nombreCompleto.toLowerCase() === clave.toLowerCase() ||
      esMismaPersona(c.nombreCompleto, clave) ||
      nombreCabeEn(clave, c.nombreCompleto) ||
      nombreCabeEn(c.nombreCompleto, clave),
  );
  if (match) {
    if (clave.length > match.nombreCompleto.length) {
      db.update(clientes)
        .set({ nombreCompleto: clave, updatedAt: nowIso })
        .where(eq(clientes.id, match.id))
        .run();
    }
    return match.id;
  }

  const id = uuidv7();
  db.insert(clientes)
    .values({
      id,
      nombreCompleto: clave,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .run();
  return id;
}

function nombreCabeEn(corto: string, largo: string): boolean {
  const tc = tokensNombre(corto);
  const tl = new Set(tokensNombre(largo));
  if (tc.length === 0 || largo.length <= corto.length) return false;
  return tc.every((t) => tl.has(t)) && (tc.length >= 2 || (tc.length === 1 && tc[0]!.length >= 6));
}

/**
 * Lista agrupada por cliente. El orden es la primera vez que apareció
 * (lunes Juanito se queda arriba; el miércoles se apila ahí).
 */
export function listarPorCliente(q: string): ListaAgrupada {
  const patron = `%${q}%`;
  const juicio = compactarNumeroJuicio(q);
  const dashed = juicio ? formatearNumeroJuicio(juicio) : null;

  const filas = db
    .select({
      id: causas.id,
      numeroJuicio: causas.numeroJuicio,
      materia: causas.materia,
      estado: causas.estado,
      origen: causas.origen,
      clienteId: causas.clienteId,
      clienteNombre: clientes.nombreCompleto,
      ultimaSincronizacion: causas.ultimaSincronizacion,
      createdAt: causas.createdAt,
      updatedAt: causas.updatedAt,
    })
    .from(causas)
    .leftJoin(
      clientes,
      and(eq(clientes.id, causas.clienteId), isNull(clientes.deletedAt)),
    )
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
    .orderBy(asc(causas.createdAt))
    .limit(300)
    .all();

  const porCliente = new Map<string, ClienteLista>();
  const sinCliente: CausaEnCliente[] = [];
  const causaIds: string[] = [];

  for (const f of filas) {
    const causa: CausaEnCliente = {
      id: f.id,
      numeroJuicio: f.numeroJuicio,
      materia: f.materia,
      estado: f.estado,
      origen: f.origen,
      ultimaSincronizacion: f.ultimaSincronizacion,
      createdAt: f.createdAt,
    };
    causaIds.push(f.id);
    if (!f.clienteId || !f.clienteNombre || esAbogadaOficina(f.clienteNombre)) {
      sinCliente.push(causa);
      continue;
    }
    let g = porCliente.get(f.clienteId);
    if (!g) {
      g = {
        id: f.clienteId,
        nombre: f.clienteNombre,
        nCausas: 0,
        nActuaciones: 0,
        primeraFecha: f.createdAt,
        ultimaActividad: f.updatedAt,
        causas: [],
      };
      porCliente.set(f.clienteId, g);
    }
    g.causas.push(causa);
    g.nCausas += 1;
    if (f.updatedAt > (g.ultimaActividad ?? '')) g.ultimaActividad = f.updatedAt;
  }

  if (causaIds.length > 0) {
    const acts = db
      .select({ causaId: actuaciones.causaId })
      .from(actuaciones)
      .where(and(inArray(actuaciones.causaId, causaIds), isNull(actuaciones.deletedAt)))
      .all();
    const nPorCausa = new Map<string, number>();
    for (const a of acts) {
      nPorCausa.set(a.causaId, (nPorCausa.get(a.causaId) ?? 0) + 1);
    }
    for (const g of porCliente.values()) {
      g.nActuaciones = g.causas.reduce((n, c) => n + (nPorCausa.get(c.id) ?? 0), 0);
    }
  }

  return { clientes: [...porCliente.values()], sinCliente };
}

export function expedienteCliente(clienteId: string) {
  const cliente = db
    .select({
      id: clientes.id,
      nombreCompleto: clientes.nombreCompleto,
      cedula: clientes.cedula,
      telefono: clientes.telefono,
      email: clientes.email,
      notas: clientes.notas,
      createdAt: clientes.createdAt,
    })
    .from(clientes)
    .where(and(eq(clientes.id, clienteId), isNull(clientes.deletedAt)))
    .get();
  if (!cliente) return null;
  if (esAbogadaOficina(cliente.nombreCompleto)) return null;

  const causasDel = db
    .select({
      id: causas.id,
      numeroJuicio: causas.numeroJuicio,
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
    .where(and(eq(causas.clienteId, clienteId), isNull(causas.deletedAt)))
    .orderBy(asc(causas.createdAt))
    .all();

  const ids = causasDel.map((c) => c.id);
  if (ids.length === 0) {
    return {
      cliente,
      causas: causasDel,
      partes: [],
      actuaciones: [],
      eventos: [],
      archivos: [],
      correos: [],
    };
  }

  return {
    cliente,
    causas: causasDel,
    partes: db
      .select({
        id: partesProcesales.id,
        causaId: partesProcesales.causaId,
        tipo: partesProcesales.tipo,
        nombre: partesProcesales.nombre,
        representante: partesProcesales.representante,
        numeroJuicio: causas.numeroJuicio,
      })
      .from(partesProcesales)
      .innerJoin(causas, eq(causas.id, partesProcesales.causaId))
      .where(and(inArray(partesProcesales.causaId, ids), isNull(partesProcesales.deletedAt)))
      .all(),
    actuaciones: db
      .select({
        id: actuaciones.id,
        causaId: actuaciones.causaId,
        fecha: actuaciones.fecha,
        tipo: actuaciones.tipo,
        detalle: actuaciones.detalle,
        origen: actuaciones.origen,
        numeroJuicio: causas.numeroJuicio,
      })
      .from(actuaciones)
      .innerJoin(causas, eq(causas.id, actuaciones.causaId))
      .where(and(inArray(actuaciones.causaId, ids), isNull(actuaciones.deletedAt)))
      .orderBy(desc(actuaciones.fecha), desc(actuaciones.createdAt))
      .all(),
    eventos: db
      .select({
        id: eventos.id,
        causaId: eventos.causaId,
        tipo: eventos.tipo,
        fecha: eventos.fecha,
        titulo: eventos.titulo,
        estado: eventos.estado,
        numeroJuicio: causas.numeroJuicio,
      })
      .from(eventos)
      .innerJoin(causas, eq(causas.id, eventos.causaId))
      .where(and(inArray(eventos.causaId, ids), isNull(eventos.deletedAt)))
      .orderBy(asc(eventos.fecha))
      .all(),
    archivos: db
      .select({
        id: archivos.id,
        causaId: archivos.causaId,
        nombreOriginal: archivos.nombreOriginal,
        mime: archivos.mime,
        tamano: archivos.tamano,
        createdAt: archivos.createdAt,
        indexadoRag: archivos.indexadoRag,
        numeroJuicio: causas.numeroJuicio,
      })
      .from(archivos)
      .innerJoin(causas, eq(causas.id, archivos.causaId))
      .where(and(inArray(archivos.causaId, ids), isNull(archivos.deletedAt)))
      .orderBy(desc(archivos.createdAt))
      .all(),
    correos: db
      .select({
        id: correosCasillero.id,
        causaId: correosCasillero.causaId,
        asunto: correosCasillero.asunto,
        receivedAt: correosCasillero.receivedAt,
        estado: correosCasillero.estado,
        numeroJuicio: causas.numeroJuicio,
      })
      .from(correosCasillero)
      .leftJoin(causas, eq(causas.id, correosCasillero.causaId))
      .where(inArray(correosCasillero.causaId, ids))
      .orderBy(desc(correosCasillero.createdAt))
      .all(),
  };
}

export function idsCausasDeCliente(clienteId: string): {
  id: string;
  ultimaSincronizacion: string | null;
}[] {
  return db
    .select({ id: causas.id, ultimaSincronizacion: causas.ultimaSincronizacion })
    .from(causas)
    .where(and(eq(causas.clienteId, clienteId), isNull(causas.deletedAt)))
    .all();
}

/**
 * Relee las notificaciones del casillero y deja de tratar a la abogada
 * del estudio como si fuera el cliente.
 */
export function repararClientesDesdeCasillero(): { corregidas: number } {
  const nowIso = new Date().toISOString();
  const filas = db
    .select({
      causaId: causas.id,
      clienteId: causas.clienteId,
      detalle: actuaciones.detalle,
    })
    .from(causas)
    .innerJoin(actuaciones, eq(actuaciones.causaId, causas.id))
    .where(and(isNull(causas.deletedAt), eq(actuaciones.origen, 'correo')))
    .all();

  const porCausa = new Map<string, { clienteId: string | null; detalles: string[] }>();
  for (const f of filas) {
    const g = porCausa.get(f.causaId) ?? { clienteId: f.clienteId, detalles: [] };
    g.detalles.push(f.detalle);
    porCausa.set(f.causaId, g);
  }

  let corregidas = 0;
  for (const [causaId, g] of porCausa) {
    let nombreCliente = '';
    for (const d of g.detalles) {
      const p = parsearNotificacionCasillero(d);
      if (p.cliente) {
        nombreCliente = p.cliente;
        break;
      }
    }
    const nuevoId = nombreCliente ? asegurarClientePorNombre(nombreCliente) : null;
    if (nuevoId === g.clienteId) continue;
    db.update(causas)
      .set({ clienteId: nuevoId, updatedAt: nowIso })
      .where(eq(causas.id, causaId))
      .run();
    if (nombreCliente) {
      db.update(partesProcesales)
        .set({ nombre: nombreCliente, updatedAt: nowIso })
        .where(and(eq(partesProcesales.causaId, causaId), eq(partesProcesales.tipo, 'actor')))
        .run();
    }
    corregidas++;
  }

  const abogadaIds = db
    .select({ id: clientes.id, nombreCompleto: clientes.nombreCompleto })
    .from(clientes)
    .where(isNull(clientes.deletedAt))
    .all()
    .filter((c) => esAbogadaOficina(c.nombreCompleto))
    .map((c) => c.id);

  for (const id of abogadaIds) {
    const r = db
      .update(causas)
      .set({ clienteId: null, updatedAt: nowIso })
      .where(and(eq(causas.clienteId, id), isNull(causas.deletedAt)))
      .run();
    corregidas += r.changes ?? 0;
    db.update(clientes)
      .set({ deletedAt: nowIso, updatedAt: nowIso })
      .where(eq(clientes.id, id))
      .run();
  }

  const huérfanas = db
    .select({ id: causas.id })
    .from(causas)
    .where(and(isNull(causas.deletedAt), isNull(causas.clienteId)))
    .all();
  for (const c of huérfanas) {
    const actor = db
      .select({ nombre: partesProcesales.nombre })
      .from(partesProcesales)
      .where(
        and(
          eq(partesProcesales.causaId, c.id),
          eq(partesProcesales.tipo, 'actor'),
          isNull(partesProcesales.deletedAt),
        ),
      )
      .all()
      .find((p) => p.nombre && !esAbogadaOficina(p.nombre) && !nombrePocoFiable(p.nombre));
    if (!actor?.nombre) continue;
    const nuevoId = asegurarClientePorNombre(actor.nombre);
    db.update(causas)
      .set({ clienteId: nuevoId, updatedAt: nowIso })
      .where(eq(causas.id, c.id))
      .run();
    corregidas++;
  }

  return { corregidas };
}
