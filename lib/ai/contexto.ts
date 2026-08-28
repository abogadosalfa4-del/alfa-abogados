import { and, asc, desc, eq, gte, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  actuaciones,
  causas,
  clientes,
  eventos,
  partesProcesales,
} from '@/lib/db/schema';
import { hoyISO } from '@/lib/fechas';

/**
 * Ficha estructurada de la causa en contexto (PLAN §6.2.2): partes, tipo,
 * estado, últimas 10 actuaciones y próximos eventos, serializada compacta.
 */
export function fichaCausa(causaId: string): string | null {
  const causa = db
    .select({
      numeroJuicio: causas.numeroJuicio,
      materia: causas.materia,
      tipoAccion: causas.tipoAccion,
      judicatura: causas.judicatura,
      estado: causas.estado,
      clienteNombre: clientes.nombreCompleto,
    })
    .from(causas)
    .leftJoin(clientes, eq(clientes.id, causas.clienteId))
    .where(and(eq(causas.id, causaId), isNull(causas.deletedAt)))
    .get();
  if (!causa) return null;

  const partes = db
    .select({ tipo: partesProcesales.tipo, nombre: partesProcesales.nombre })
    .from(partesProcesales)
    .where(and(eq(partesProcesales.causaId, causaId), isNull(partesProcesales.deletedAt)))
    .all();

  const acts = db
    .select({ fecha: actuaciones.fecha, tipo: actuaciones.tipo, detalle: actuaciones.detalle })
    .from(actuaciones)
    .where(and(eq(actuaciones.causaId, causaId), isNull(actuaciones.deletedAt)))
    .orderBy(desc(actuaciones.fecha))
    .limit(10)
    .all();

  const proximos = db
    .select({ fecha: eventos.fecha, tipo: eventos.tipo, titulo: eventos.titulo })
    .from(eventos)
    .where(
      and(
        eq(eventos.causaId, causaId),
        isNull(eventos.deletedAt),
        gte(eventos.fecha, hoyISO()),
      ),
    )
    .orderBy(asc(eventos.fecha))
    .limit(10)
    .all();

  return [
    `### Causa en contexto`,
    `Número de juicio: ${causa.numeroJuicio}`,
    `Cliente: ${causa.clienteNombre ?? '—'}`,
    `Materia: ${causa.materia ?? '—'} · Tipo de acción: ${causa.tipoAccion ?? '—'} · Judicatura: ${causa.judicatura ?? '—'} · Estado: ${causa.estado ?? '—'}`,
    `Partes: ${partes.map((p) => `${p.tipo}: ${p.nombre}`).join('; ') || '—'}`,
    `Últimas actuaciones:`,
    ...acts.map((a) => `  - ${a.fecha} ${a.tipo}: ${a.detalle.slice(0, 200)}`),
    `Próximos eventos/plazos:`,
    ...proximos.map((e) => `  - ${e.fecha} (${e.tipo}) ${e.titulo}`),
  ].join('\n');
}
