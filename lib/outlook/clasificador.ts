import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { causas } from '@/lib/db/schema';
import { extraerFechaHora, extraerNumeroJuicio } from '@/lib/extraer-fecha';
import { inferirEtiqueta } from '@/lib/etiquetas-evento';
import type { CorreoParseado } from '@/lib/outlook/parsers';

export interface EventoBorrador {
  tipo: 'escrito' | 'audiencia' | 'diligencia';
  titulo: string;
  fecha: string; // YYYY-MM-DD
  hora: string | null;
  causaId: string | null;
  clienteId: string | null;
  descripcion: string;
  numeroJuicioDetectado: string | null;
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function limpiarAsunto(subject: string): string {
  return subject.replace(/^\s*(re|rv|fwd|fw)\s*:\s*/gi, '').trim() || 'Correo sin asunto';
}

/**
 * Heurística de clasificación de un correo arrastrado al calendario
 * (PLAN §4.4.5). Devuelve un evento BORRADOR: nunca se guarda sin confirmación.
 */
export function clasificarCorreo(
  correo: CorreoParseado,
  fechaCelda: string,
): EventoBorrador {
  const texto = `${correo.subject}\n${correo.bodyText}`;
  const t = norm(texto);

  // Vincular causa por número de juicio.
  const numero = extraerNumeroJuicio(texto);
  let causaId: string | null = null;
  let clienteId: string | null = null;
  if (numero) {
    const causa = db
      .select({ id: causas.id, clienteId: causas.clienteId })
      .from(causas)
      .where(and(eq(causas.numeroJuicio, numero), isNull(causas.deletedAt)))
      .get();
    causaId = causa?.id ?? null;
    clienteId = causa?.clienteId ?? null;
  }

  let tipo: EventoBorrador['tipo'] = 'diligencia';
  let fecha = fechaCelda;
  let hora: string | null = null;

  if (/audiencia|convocase|convoca a audiencia|senala.*audiencia/.test(t)) {
    tipo = 'audiencia';
    const extraida = extraerFechaHora(correo.bodyText) ?? extraerFechaHora(correo.subject);
    if (extraida) {
      fecha = extraida.fecha; // la fecha del cuerpo manda sobre la celda (§4.4.5)
      hora = extraida.hora ?? null;
    }
  } else if (/termino|contestar|traslado|contestacion/.test(t)) {
    tipo = 'escrito';
  }

  return {
    tipo,
    titulo: inferirEtiqueta(`${limpiarAsunto(correo.subject)} ${texto}`, tipo),
    fecha,
    hora,
    causaId,
    clienteId,
    descripcion: [
      `De: ${correo.from || '—'}`,
      correo.receivedAt ? `Recibido: ${correo.receivedAt}` : null,
      '',
      correo.bodyText.slice(0, 1500),
    ]
      .filter((l) => l !== null)
      .join('\n'),
    numeroJuicioDetectado: numero,
  };
}
