import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '@/lib/db';
import { causas, clientes, correosCasillero, user } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { ingestarNotificacionCasillero } from '@/lib/causas';
import { extraerNumeroJuicio, parsearNotificacionCasillero } from '@/lib/extraer-fecha';
import {
  estadoConexion,
  traerMensajesCasillero,
  type MensajeCasillero,
} from '@/lib/outlook/graph';
import { estadoImap, traerMensajesImap } from '@/lib/outlook/imap';
import { acusarOutbite, estadoOutbite, traerMensajesOutbite } from '@/lib/outlook/outbite';
import { crearNotificacion } from '@/lib/notificaciones';
import { errores } from '@/lib/errores';

const logger = log('casillero');

function esNotificacionCasillero(m: MensajeCasillero): boolean {
  const blob = `${m.from} ${m.subject} ${m.bodyPreview} ${m.bodyText}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return (
    blob.includes('funcionjudicial') ||
    blob.includes('casillero electronico') ||
    blob.includes('casillero judicial') ||
    blob.includes('ha recibido una notificacion') ||
    /\bjuicio\s*n[oº°.]/i.test(blob)
  );
}

export async function ingestarCasilleroDesdeBuzon(
  userId: string,
  opts: { dias?: number } = {},
): Promise<{ leidos: number; casillero: number; ingresados: number; errores: number }> {
  if (estadoOutbite().configurado) {
    const mensajes = await traerMensajesOutbite();
    const r = await ingestarMensajes(userId, mensajes);
    await acusarOutbite(mensajes.map((m) => m.id));
    return r;
  }
  const mensajes = await traerMensajesOrigen(userId, opts.dias ?? 90);
  return ingestarMensajes(userId, mensajes);
}

/** Vacía el buzón pendiente en tandas (p. ej. al prender la app). */
export async function ingestarCasilleroAcumulado(
  userId: string,
): Promise<{ leidos: number; casillero: number; ingresados: number; errores: number }> {
  if (!estadoOutbite().configurado) {
    return ingestarCasilleroDesdeBuzon(userId, { dias: 90 });
  }
  const total = { leidos: 0, casillero: 0, ingresados: 0, errores: 0 };
  for (let i = 0; i < 50; i++) {
    const r = await ingestarCasilleroDesdeBuzon(userId, { dias: 90 });
    total.leidos += r.leidos;
    total.casillero += r.casillero;
    total.ingresados += r.ingresados;
    total.errores += r.errores;
    if (r.leidos === 0) break;
  }
  return total;
}

async function traerMensajesOrigen(userId: string, dias: number): Promise<MensajeCasillero[]> {
  if (estadoImap().conectado) {
    return traerMensajesImap({ dias, max: 250 });
  }
  if (estadoConexion(userId).conectado) {
    return traerMensajesCasillero(userId, { dias, max: 250 });
  }
  throw errores.validacion('Configurá casillero@outbite.app en Correos.');
}

async function ingestarMensajes(
  userId: string,
  mensajes: MensajeCasillero[],
): Promise<{ leidos: number; casillero: number; ingresados: number; errores: number }> {
  const rol =
    db.select({ role: user.role }).from(user).where(eq(user.id, userId)).get()?.role ??
    'abogado';
  const actor = { userId, role: rol };

  let casillero = 0;
  let ingresados = 0;
  let erroresN = 0;

  for (const m of mensajes) {
    const ya = db
      .select({ id: correosCasillero.id })
      .from(correosCasillero)
      .where(eq(correosCasillero.graphMessageId, m.id))
      .get();
    if (ya) continue;

    if (!esNotificacionCasillero(m)) {
      registrar(m, userId, 'omitido', null, null);
      continue;
    }
    casillero++;
    const texto = [m.subject, m.bodyText].filter(Boolean).join('\n\n');
    try {
      const { causa } = ingestarNotificacionCasillero(texto, actor, {
        origenActuacion: 'correo',
      });
      registrar(m, userId, 'ingestado', causa.id, null);
      ingresados++;
    } catch (err) {
      erroresN++;
      const msg = err instanceof Error ? err.message : 'Error al parsear';
      registrar(m, userId, 'error', null, msg);
      logger.warn({ err, asunto: m.subject }, 'casillero no ingresado');
    }
  }

  logger.info(
    { userId, leidos: mensajes.length, casillero, ingresados, errores: erroresN },
    'ingesta casillero',
  );
  if (ingresados > 0) {
    crearNotificacion({
      userId,
      tipo: 'casillero',
      mensaje: `${ingresados} notificación(es) del casillero ingresadas al expediente.`,
      link: '/causas',
    });
  }
  return { leidos: mensajes.length, casillero, ingresados, errores: erroresN };
}

function registrar(
  m: MensajeCasillero,
  userId: string,
  estado: 'ingestado' | 'omitido' | 'error',
  causaId: string | null,
  error: string | null,
): void {
  const cuerpo = m.bodyText?.trim() || m.bodyPreview?.trim() || null;
  const numeroJuicio =
    extraerNumeroJuicio([m.subject, m.bodyText, m.bodyPreview].filter(Boolean).join('\n')) ??
    null;
  db.insert(correosCasillero)
    .values({
      id: uuidv7(),
      graphMessageId: m.id,
      userId,
      causaId,
      internetMessageId: m.internetMessageId || null,
      receivedAt: m.receivedDateTime,
      asunto: m.subject,
      remitente: m.from || null,
      cuerpo: cuerpo ? cuerpo.slice(0, 50_000) : null,
      numeroJuicio,
      leido: false,
      estado,
      error,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();
}

export type CorreoCasilleroLista = {
  id: string;
  asunto: string | null;
  remitente: string | null;
  receivedAt: string | null;
  preview: string;
  leido: boolean;
  estado: 'ingestado' | 'omitido' | 'error';
  error: string | null;
  causaId: string | null;
  numeroJuicio: string | null;
  clienteNombre: string | null;
};

export type CorreoCasilleroDetalle = CorreoCasilleroLista & {
  cuerpo: string | null;
  judicatura: string | null;
};

function metaDeTexto(asunto: string | null, fragmento: string | null) {
  const p = parsearNotificacionCasillero([asunto, fragmento].filter(Boolean).join('\n'));
  return {
    cliente: p.cliente || null,
    juicio: p.numeroJuicio || null,
    juzgado: p.judicatura || null,
  };
}

export function listarCorreosCasillero(): {
  correos: CorreoCasilleroLista[];
  noLeidos: number;
} {
  const rows = db
    .select({
      id: correosCasillero.id,
      asunto: correosCasillero.asunto,
      remitente: correosCasillero.remitente,
      receivedAt: correosCasillero.receivedAt,
      leido: correosCasillero.leido,
      estado: correosCasillero.estado,
      error: correosCasillero.error,
      causaId: correosCasillero.causaId,
      numeroJuicioStored: correosCasillero.numeroJuicio,
      causaNumero: causas.numeroJuicio,
      clienteCausa: clientes.nombreCompleto,
      fragmento: sql<string | null>`substr(coalesce(${correosCasillero.cuerpo}, ''), 1, 4000)`,
    })
    .from(correosCasillero)
    .leftJoin(causas, eq(causas.id, correosCasillero.causaId))
    .leftJoin(
      clientes,
      and(eq(clientes.id, causas.clienteId), isNull(clientes.deletedAt)),
    )
    .where(ne(correosCasillero.estado, 'omitido'))
    .orderBy(
      asc(correosCasillero.leido),
      desc(correosCasillero.receivedAt),
      desc(correosCasillero.createdAt),
    )
    .all();

  const correos = rows.map((row) => {
    const parsed = metaDeTexto(row.asunto, row.fragmento);
    const preview = (row.fragmento ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);
    return {
      id: row.id,
      asunto: row.asunto,
      remitente: row.remitente,
      receivedAt: row.receivedAt,
      preview: preview || (row.asunto ?? ''),
      leido: Boolean(row.leido),
      estado: row.estado,
      error: row.error,
      causaId: row.causaId,
      numeroJuicio: row.numeroJuicioStored || row.causaNumero || parsed.juicio || null,
      clienteNombre: row.clienteCausa || parsed.cliente || null,
    };
  });

  return {
    correos,
    noLeidos: correos.filter((c) => !c.leido).length,
  };
}

export function abrirCorreoCasillero(id: string): CorreoCasilleroDetalle | undefined {
  const row = db
    .select({
      id: correosCasillero.id,
      asunto: correosCasillero.asunto,
      remitente: correosCasillero.remitente,
      receivedAt: correosCasillero.receivedAt,
      leido: correosCasillero.leido,
      estado: correosCasillero.estado,
      error: correosCasillero.error,
      causaId: correosCasillero.causaId,
      numeroJuicioStored: correosCasillero.numeroJuicio,
      cuerpo: correosCasillero.cuerpo,
      causaNumero: causas.numeroJuicio,
      clienteCausa: clientes.nombreCompleto,
    })
    .from(correosCasillero)
    .leftJoin(causas, eq(causas.id, correosCasillero.causaId))
    .leftJoin(
      clientes,
      and(eq(clientes.id, causas.clienteId), isNull(clientes.deletedAt)),
    )
    .where(eq(correosCasillero.id, id))
    .get();
  if (!row) return undefined;

  if (!row.leido) {
    db.update(correosCasillero)
      .set({ leido: true, leidoAt: new Date().toISOString() })
      .where(eq(correosCasillero.id, id))
      .run();
  }

  const parsed = metaDeTexto(row.asunto, row.cuerpo);
  const preview = (row.cuerpo ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);
  return {
    id: row.id,
    asunto: row.asunto,
    remitente: row.remitente,
    receivedAt: row.receivedAt,
    preview: preview || (row.asunto ?? ''),
    leido: true,
    estado: row.estado,
    error: row.error,
    causaId: row.causaId,
    numeroJuicio: row.numeroJuicioStored || row.causaNumero || parsed.juicio || null,
    clienteNombre: row.clienteCausa || parsed.cliente || null,
    cuerpo: row.cuerpo,
    judicatura: parsed.juzgado,
  };
}
