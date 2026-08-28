import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  clientes,
  causas,
  actuaciones,
  eventos,
  reglasPlazo,
  type Actuacion,
  type Causa,
  type ReglaPlazo,
} from '@/lib/db/schema';
import { sumarDiasCalendario, sumarDiasHabiles } from '@/lib/feriados';
import { extraerFechaAudiencia } from '@/lib/extraer-fecha';
import { inferirEtiqueta } from '@/lib/etiquetas-evento';
import { crearEvento } from '@/lib/eventos';
import { crearTareaSuelta } from '@/lib/tareas';
import { log } from '@/lib/logger';

const logger = log('plazos');

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/** Tipos que solo certifican trámites; nunca abren plazos por sí solos. */
const TIPOS_PROCEDIMENTALES = [
  'RAZON',
  'OFICIO',
  'ESCRITO',
  'ACTA',
  'PROVIDENCIA',
  'ANEXOS',
  'NOTIFICACION',
] as const;

/** Actas registran una audiencia ya celebrada, no una convocatoria. */
const TIPOS_AUDIENCIA_PASADA = ['ACTA', 'RAZON'] as const;

/** Tipos resolutorios: mencionan audiencias pasadas, no convocan una nueva. */
const TIPOS_SIN_CONVOCATORIA = [
  'SENTENCIA',
  'AUTO INTERLOCUTORIO',
  'AUTO DE CALIFICACION',
  'AUTO DE SUSTANCIACION',
  'OFICIO',
  'NOTIFICACION',
] as const;

const VERBO_CONVOCATORIA =
  /\b(convoc(a|o|ar|acion|ación)|señala|senala|fija|cita)\b[\s\S]{0,80}?\baudiencia\b/i;

/** Referencias a audiencias ya ocurridas o anuladas, no convocatorias futuras. */
const AUDIENCIA_PASADA =
  /\b(durante la|celebrada|convocada|citada|nulidad de lo actuado en la|actuado en la)\s+audiencia\b/i;

/**
 * Solo genera evento de audiencia ante convocatorias reales, no cuando un auto
 * o sentencia alude a una audiencia ya ocurrida o anulada.
 */
export function esConvocatoriaAudiencia(actuacion: Actuacion): boolean {
  const tipo = norm(actuacion.tipo);
  const det = norm(actuacion.detalle);

  if (TIPOS_AUDIENCIA_PASADA.some((t) => tipo.includes(t))) return false;
  if (TIPOS_SIN_CONVOCATORIA.some((t) => tipo.includes(t))) return false;
  if (/AUTO DE NULIDAD|NULIDAD DE LO ACTUADO|DECLARATORIA DE NULIDAD/.test(det)) {
    return false;
  }

  const convocatoriaEnTexto =
    tipo.includes('CONVOCATORIA') ||
    tipo.includes('SEÑALAMIENTO DE AUDIENCIA') ||
    tipo.includes('SENALAMIENTO DE AUDIENCIA') ||
    VERBO_CONVOCATORIA.test(actuacion.detalle);

  if (tipo.includes('AUDIENCIA') && !convocatoriaEnTexto) return false;
  if (tipo.includes('AUDIENCIA') || tipo.includes('CONVOCATORIA')) return true;
  if (AUDIENCIA_PASADA.test(actuacion.detalle)) return false;
  if (VERBO_CONVOCATORIA.test(actuacion.detalle)) return true;

  return false;
}

/** Oficios, razones y escritos que solo mencionan una sentencia ajena al plazo. */
const TIPOS_SIN_SENTENCIA_APELABLE = [
  ...TIPOS_PROCEDIMENTALES,
  'CITACION',
  'AUTO DE SUSTANCIACION',
  'INICIO DE EJECUCION',
  'ATENDER PETICION',
] as const;

/** Garantías constitucionales usan LOGJCC, no el plazo genérico COGEP de apelación. */
const PROCESOS_SIN_APELACION_COGEP = [
  'GARANTIAS JURISDICCIONALES',
  'HABEAS CORPUS',
  'CONSTITUCIONAL',
  'ACCION DE PROTECCION',
  'PROTECCION',
  'MEDIDAS CAUTELARES',
  'CONTROL CONSTITUCIONAL',
] as const;

export function esSentenciaApelable(actuacion: Actuacion): boolean {
  const tipo = norm(actuacion.tipo);
  const det = norm(actuacion.detalle);

  if (TIPOS_SIN_SENTENCIA_APELABLE.some((t) => tipo.includes(t))) return false;
  if (/EJECUTORIADA|EJECUTORIA|RAZON DE EJECUTORIA/.test(det)) return false;
  if (/AUTO DE NULIDAD|NULIDAD DE LO ACTUADO|DECLARATORIA DE NULIDAD/.test(det)) {
    return false;
  }
  if (/\bSENTENCIA\b/.test(tipo)) return true;
  if (tipo.includes('RESOLUCION')) {
    return /\b(SENTENCIA|RESUELVE|RESOLVIÓ|SE RESUELVE|MOTIVA LA PRESENTE SENTENCIA)\b/.test(
      det,
    );
  }
  return false;
}

/** Solo autos interlocutorios reales en el tipo SATJE, no menciones en el detalle. */
export function esAutoInterlocutorioApelable(actuacion: Actuacion): boolean {
  const tipo = norm(actuacion.tipo);
  if (TIPOS_PROCEDIMENTALES.some((t) => tipo.includes(t))) return false;
  if (tipo.includes('AUTO DE SUSTANCIACION')) return false;
  if (tipo.includes('RESOLUCION')) return false;
  if (!tipo.includes('AUTO INTERLOCUTORIO')) return false;
  return true;
}

/** Citación al demandado para contestar; no la razón de citación ya cumplida. */
export function esCitacionDemandado(actuacion: Actuacion): boolean {
  const tipo = norm(actuacion.tipo);
  if (TIPOS_PROCEDIMENTALES.some((t) => tipo.includes(t))) return false;
  if (tipo.includes('CITACION REALIZADA')) return false;
  if (tipo.includes('EMPLAZAMIENTO')) return true;
  return tipo.includes('CITACION') || tipo.includes('CITACIÓN');
}

function procesoUsaApelacionCogep(causa: Causa): boolean {
  const proc = `${norm(causa.tipoAccion)} ${norm(causa.materia)}`;
  return !PROCESOS_SIN_APELACION_COGEP.some((p) => proc.includes(p));
}

function reglaAplica(regla: ReglaPlazo, actuacion: Actuacion, causa: Causa): boolean {
  if (regla.eventoTipo === 'audiencia') {
    return esConvocatoriaAudiencia(actuacion);
  }

  if (norm(regla.actuacionTrigger) === 'SENTENCIA') {
    if (!procesoUsaApelacionCogep(causa)) return false;
    return esSentenciaApelable(actuacion);
  }

  if (norm(regla.actuacionTrigger) === 'AUTO INTERLOCUTORIO') {
    if (!procesoUsaApelacionCogep(causa)) return false;
    return esAutoInterlocutorioApelable(actuacion);
  }

  if (norm(regla.actuacionTrigger) === 'CITACION') {
    if (!esCitacionDemandado(actuacion)) return false;
    if (regla.tipoProceso === '*') return true;
    const proc = `${norm(causa.tipoAccion)} ${norm(causa.materia)}`;
    return proc.includes(norm(regla.tipoProceso));
  }

  const texto = `${norm(actuacion.tipo)} ${norm(actuacion.detalle)}`;
  if (!texto.includes(norm(regla.actuacionTrigger))) return false;
  if (regla.tipoProceso === '*') return true;
  const proc = `${norm(causa.tipoAccion)} ${norm(causa.materia)}`;
  return proc.includes(norm(regla.tipoProceso));
}

function existeEventoRegla(reglaId: string, causaId: string, fecha: string): boolean {
  const row = db
    .select({ id: eventos.id })
    .from(eventos)
    .where(
      and(
        eq(eventos.reglaId, reglaId),
        eq(eventos.causaId, causaId),
        eq(eventos.fecha, fecha),
        isNull(eventos.deletedAt),
      ),
    )
    .get();
  return Boolean(row);
}

/**
 * Motor de plazos COGEP (PLAN §5.4). Por cada actuación NUEVA evalúa las reglas
 * activas y crea el evento (+ tarea encadenada si es escrito) en la fecha de
 * vencimiento calculada en días hábiles/calendario desde el día siguiente.
 */
export function evaluarPlazos(
  causa: Causa,
  nuevasActuaciones: Actuacion[],
  actorId: string,
): { eventosCreados: number } {
  if (nuevasActuaciones.length === 0) return { eventosCreados: 0 };

  const reglas = db
    .select()
    .from(reglasPlazo)
    .where(and(eq(reglasPlazo.activo, true), isNull(reglasPlazo.deletedAt)))
    .all();

  const cliente = causa.clienteId ? nombreCliente(causa.clienteId) : null;
  let creados = 0;

  for (const act of nuevasActuaciones) {
    for (const regla of reglas) {
      if (!reglaAplica(regla, act, causa)) continue;

      const titulo = inferirEtiqueta(
        `${regla.eventoTituloTemplate ?? ''} ${regla.nombre} ${act.tipo} ${act.detalle}`,
        regla.eventoTipo ?? 'escrito',
      );

      // Regla de audiencia (días 0): fecha extraída del texto de la actuación.
      if (regla.eventoTipo === 'audiencia') {
        const extraida = extraerFechaAudiencia(act.detalle, act.fecha);
        if (!extraida) {
          crearTareaSuelta(
            {
              titulo: `Verificar fecha de audiencia — ${cliente ?? causa.numeroJuicio}`,
              causaId: causa.id,
              fechaLimite: act.fecha,
              color: 'amber',
            },
            actorId,
          );
          continue;
        }
        if (existeEventoRegla(regla.id, causa.id, extraida.fecha)) continue;
        crearEvento(
          {
            tipo: 'audiencia',
            titulo,
            fecha: extraida.fecha,
            hora: extraida.hora ?? null,
            causaId: causa.id,
            clienteId: causa.clienteId,
            descripcion: `Generado desde actuación del ${act.fecha}: ${act.detalle.slice(0, 300)}`,
          },
          { userId: actorId },
          { origen: 'sadje-regla', reglaId: regla.id },
        );
        creados++;
        continue;
      }

      // Reglas de plazo (escrito): calcular vencimiento.
      const fecha =
        regla.tipoDias === 'habiles'
          ? sumarDiasHabiles(act.fecha, regla.dias)
          : sumarDiasCalendario(act.fecha, regla.dias);

      if (existeEventoRegla(regla.id, causa.id, fecha)) continue;

      crearEvento(
        {
          tipo: regla.eventoTipo ?? 'escrito',
          titulo,
          fecha,
          causaId: causa.id,
          clienteId: causa.clienteId,
          descripcion: `Plazo por regla «${regla.nombre}» a partir de la actuación del ${act.fecha}.`,
        },
        { userId: actorId },
        { origen: 'sadje-regla', reglaId: regla.id },
      );
      creados++;
      logger.info(
        { causa: causa.numeroJuicio, regla: regla.nombre, fecha },
        'plazo generado',
      );
    }
  }

  return { eventosCreados: creados };
}

type EventoRegla = typeof eventos.$inferSelect;

/** Revalida un evento generado por regla contra la actuación que lo originó. */
export function eventoReglaSigueValido(
  evento: EventoRegla,
  causa: Causa,
  actuacionesCausa: Actuacion[],
  reglas: ReglaPlazo[],
): boolean {
  if (evento.origen !== 'sadje-regla' || !evento.reglaId || !evento.causaId) return true;

  const regla = reglas.find((r) => r.id === evento.reglaId);
  if (!regla) return true;

  const m = evento.descripcion?.match(/actuación del (\d{4}-\d{2}-\d{2})/);
  const acts = m
    ? actuacionesCausa.filter((a) => a.fecha === m[1])
    : actuacionesCausa;

  if (regla.eventoTipo === 'audiencia') {
    if (!acts.some((a) => esConvocatoriaAudiencia(a))) return false;
    return acts.some((a) => {
      const f = extraerFechaAudiencia(a.detalle, a.fecha);
      return f?.fecha === evento.fecha;
    });
  }

  return acts.some((a) => reglaAplica(regla, a, causa));
}

/** Soft-delete de eventos de reglas que ya no pasarían el filtro antifrágil. */
export function limpiarEventosReglaInvalidos(causaId?: string): number {
  const reglas = db
    .select()
    .from(reglasPlazo)
    .where(isNull(reglasPlazo.deletedAt))
    .all();
  const causasAll = db
    .select()
    .from(causas)
    .where(
      causaId
        ? and(eq(causas.id, causaId), isNull(causas.deletedAt))
        : isNull(causas.deletedAt),
    )
    .all();
  const actsAll = db
    .select()
    .from(actuaciones)
    .where(isNull(actuaciones.deletedAt))
    .all();
  const actsPorCausa = new Map<string, Actuacion[]>();
  for (const a of actsAll) {
    if (causaId && a.causaId !== causaId) continue;
    const lista = actsPorCausa.get(a.causaId) ?? [];
    lista.push(a);
    actsPorCausa.set(a.causaId, lista);
  }
  const causaPorId = new Map(causasAll.map((c) => [c.id, c]));

  const activos = db
    .select()
    .from(eventos)
    .where(
      causaId
        ? and(
            eq(eventos.origen, 'sadje-regla'),
            eq(eventos.causaId, causaId),
            isNull(eventos.deletedAt),
          )
        : and(eq(eventos.origen, 'sadje-regla'), isNull(eventos.deletedAt)),
    )
    .all();

  let borrados = 0;
  const now = new Date().toISOString();
  for (const ev of activos) {
    const causa = ev.causaId ? causaPorId.get(ev.causaId) : undefined;
    if (!causa) continue;
    const acts = actsPorCausa.get(causa.id) ?? [];
    if (eventoReglaSigueValido(ev, causa, acts, reglas)) continue;

    db.update(eventos)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(eventos.id, ev.id))
      .run();
    borrados++;
    logger.info(
      { evento: ev.id, titulo: ev.titulo, juicio: causa.numeroJuicio },
      'evento regla invalido eliminado',
    );
  }
  return borrados;
}

/** Elimina eventos inválidos y regenera los que faltan según actuaciones existentes. */
export function reconciliarEventosRegla(actorId: string): {
  borrados: number;
  creados: number;
} {
  const borrados = limpiarEventosReglaInvalidos();
  let creados = 0;

  const causasAll = db.select().from(causas).where(isNull(causas.deletedAt)).all();
  for (const causa of causasAll) {
    const acts = db
      .select()
      .from(actuaciones)
      .where(and(eq(actuaciones.causaId, causa.id), isNull(actuaciones.deletedAt)))
      .all();
    if (acts.length === 0) continue;
    creados += evaluarPlazos(causa, acts, actorId).eventosCreados;
  }

  return { borrados, creados };
}

function nombreCliente(clienteId: string): string | null {
  const r = db
    .select({ nombre: clientes.nombreCompleto })
    .from(clientes)
    .where(eq(clientes.id, clienteId))
    .get();
  return r?.nombre ?? null;
}
