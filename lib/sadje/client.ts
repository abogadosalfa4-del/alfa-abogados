import { log } from '@/lib/logger';
import { esperarTurno } from '@/lib/sadje/rate-limit';
import { SadjeSchemaError, SadjeUnavailableError } from '@/lib/sadje/errors';
import {
  actuacionesResponseSchema,
  buscarCausasResponseSchema,
  incidentesResponseSchema,
  informacionJuicioListaSchema,
  parseOrThrow,
  type JudicaturaIncidente,
} from '@/lib/sadje/parser';
import { compactarNumeroJuicio, formatearNumeroJuicio } from '@/lib/schemas/causa';

const logger = log('sadje');

/** El WAF de Función Judicial resetea el TCP si no van Origin/Referer del portal. */
const ORIGIN = 'https://procesosjudiciales.funcionjudicial.gob.ec';
const BASE = 'https://api.funcionjudicial.gob.ec';
const SVC_CAUSAS = '/EXPEL-CONSULTA-CAUSAS-SERVICE/api/consulta-causas';
const SVC_CLEX = '/EXPEL-CONSULTA-CAUSAS-CLEX-SERVICE/api/consulta-causas-clex';
const TIMEOUT_MS = 15_000;
const BACKOFFS = [2000, 4000, 8000];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * Cliente del API interno público de e-SATJE (PLAN §5.2). Todo el acceso a la
 * Función Judicial pasa por aquí: rate limit global (1 req / 2 s), timeout 15 s,
 * 3 reintentos con backoff 2/4/8 s. Los shapes se validan en `parser.ts`.
 *
 * El portal actual (`procesosjudiciales`) exige:
 *  - Origin/Referer de ese host (si no, ECONNRESET del F5)
 *  - Accept `application/vnd.api.v1+json` (si no, 500 "No acceptable representation")
 */
async function pedir<T>(
  path: string,
  init: RequestInit,
  parse: (data: unknown) => T,
  ctx: string,
): Promise<T> {
  let ultimoError: unknown;
  for (let intento = 0; intento <= BACKOFFS.length; intento++) {
    await esperarTurno();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/vnd.api.v1+json, application/json, */*',
          'User-Agent': UA,
          Origin: ORIGIN,
          Referer: `${ORIGIN}/`,
          ...init.headers,
        },
      });
      clearTimeout(timer);
      if (!res.ok) {
        const cuerpo = await res.text().catch(() => '');
        const reintentar = res.status >= 500 || res.status === 429;
        ultimoError = new SadjeUnavailableError(
          `e-SATJE respondió ${res.status} (${ctx}).`,
          reintentar,
        );
        logger.warn(
          { ctx, status: res.status, cuerpo: cuerpo.slice(0, 200) },
          'e-SATJE HTTP no OK',
        );
        if (!reintentar) throw ultimoError;
      } else {
        const json: unknown = await res.json();
        return parse(json);
      }
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof SadjeSchemaError) throw err;
      if (err instanceof SadjeUnavailableError && !err.retryable) throw err;
      if ((err as { name?: string }).name === 'AbortError') {
        ultimoError = new SadjeUnavailableError(
          `e-SATJE no respondió en ${TIMEOUT_MS / 1000}s (${ctx}).`,
        );
      } else if (err instanceof SadjeUnavailableError) {
        ultimoError = err;
      } else {
        const causa = causaDeFetch(err);
        ultimoError = new SadjeUnavailableError(
          `No se pudo conectar con e-SATJE (${ctx})${causa ? `: ${causa}` : ''}.`,
        );
      }
    }
    if (intento < BACKOFFS.length) {
      logger.warn({ ctx, intento }, 'reintentando e-SATJE');
      await new Promise((r) => setTimeout(r, BACKOFFS[intento]));
    }
  }
  throw ultimoError instanceof Error
    ? ultimoError
    : new SadjeUnavailableError(`e-SATJE no disponible (${ctx}).`);
}

function causaDeFetch(err: unknown): string {
  if (!(err instanceof Error)) return '';
  const c = (err as Error & { cause?: unknown }).cause;
  if (c && typeof c === 'object' && 'code' in c) return String((c as { code: string }).code);
  if (c instanceof Error) return c.message;
  return err.message;
}

/** `17204202203755` → `17204-2022-03755`; conserva letra final (`…00963G`). */
export function numeroDesdeIdJuicio(id: string): string {
  return formatearNumeroJuicio(id);
}

function textoPlano(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CausaResumenSadje {
  idJuicio: string;
  numeroJuicio: string;
  estado: string;
  materia: string;
  tipoAccion: string;
  judicatura: string;
  fechaIngreso: string;
}

export async function buscarCausas(params: {
  numeroCausa?: string;
  cedulaActor?: string;
  cedulaDemandado?: string;
  nombreActor?: string;
  nombreDemandado?: string;
}): Promise<CausaResumenSadje[]> {
  const numeroCausa =
    compactarNumeroJuicio(params.numeroCausa ?? '') ?? params.numeroCausa ?? '';
  const body = {
    numeroCausa,
    actor: {
      cedulaActor: params.cedulaActor ?? '',
      nombreActor: params.nombreActor ?? '',
    },
    demandado: {
      cedulaDemandado: params.cedulaDemandado ?? '',
      nombreDemandado: params.nombreDemandado ?? '',
    },
    provincia: '',
    numeroFiscalia: '',
    recaptcha: 'verdad',
    first: 1,
    pageSize: 50,
  };
  const items = await pedir(
    `${SVC_CAUSAS}/informacion/buscarCausas?page=1&size=50`,
    { method: 'POST', body: JSON.stringify(body) },
    (d) => parseOrThrow(buscarCausasResponseSchema, d, 'buscarCausas'),
    'buscarCausas',
  );
  const resultados = items.map((i) => ({
    idJuicio: i.idJuicio,
    numeroJuicio: i.numeroJuicio || numeroDesdeIdJuicio(i.idJuicio),
    estado: i.estadoActual,
    materia: i.nombreMateria || i.nombreDelito,
    tipoAccion: i.nombreTipoAccion,
    judicatura: i.nombreJudicatura,
    fechaIngreso: i.fechaIngreso,
  }));
  if (resultados.length === 0 && numeroCausa) {
    const directo = await buscarCausaPorIdDirecto(numeroCausa);
    if (directo) return [directo];
  }
  return resultados;
}

/** Penal/violencia a veces no sale en buscarCausas pero sí en getInformacionJuicio. */
async function buscarCausaPorIdDirecto(id: string): Promise<CausaResumenSadje | null> {
  const candidatos = [id];
  if (/[A-Z]$/.test(id)) candidatos.push(id.replace(/[A-Z]$/, ''));
  for (const cand of candidatos) {
    try {
      const det = await informacionJuicio(cand);
      if (!det.materia && !det.tipoAccion && det.partes.length === 0) continue;
      return {
        idJuicio: cand,
        numeroJuicio: det.numeroJuicio || numeroDesdeIdJuicio(cand),
        estado: det.estado,
        materia: det.materia,
        tipoAccion: det.tipoAccion,
        judicatura: det.judicatura,
        fechaIngreso: det.fechaIngreso,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export interface DetalleJuicioSadje {
  numeroJuicio: string;
  estado: string;
  materia: string;
  tipoAccion: string;
  judicatura: string;
  fechaIngreso: string;
  partes: { tipo: string; nombre: string; representante: string }[];
}

async function listarIncidentes(idJuicio: string): Promise<JudicaturaIncidente[]> {
  try {
    return await pedir(
      `${SVC_CLEX}/informacion/getIncidenteJudicatura/${encodeURIComponent(idJuicio)}`,
      { method: 'GET' },
      (x) => parseOrThrow(incidentesResponseSchema, x, 'getIncidenteJudicatura'),
      'getIncidenteJudicatura',
    );
  } catch (err) {
    logger.warn({ err, idJuicio }, 'incidentes no disponibles');
    return [];
  }
}

function fusionarPartes(
  ...listas: { tipo: string; nombre: string; representante: string }[][]
): { tipo: string; nombre: string; representante: string }[] {
  const seen = new Set<string>();
  const partes: { tipo: string; nombre: string; representante: string }[] = [];
  for (const lista of listas) {
    for (const p of lista) {
      const nombre = p.nombre.trim();
      if (!nombre) continue;
      const key = `${p.tipo}:${nombre.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      partes.push({ ...p, nombre });
    }
  }
  return partes;
}

function partesDeIncidentes(
  judicaturas: JudicaturaIncidente[],
): { tipo: string; nombre: string; representante: string }[] {
  const partes: { tipo: string; nombre: string; representante: string }[] = [];
  for (const j of judicaturas) {
    for (const inc of j.lstIncidenteJudicatura) {
      for (const [tipo, lista] of [
        ['actor', inc.lstLitiganteActor] as const,
        ['demandado', inc.lstLitiganteDemandado] as const,
      ]) {
        for (const p of lista) {
          partes.push({
            tipo,
            nombre: p.nombresLitigante,
            representante: p.representadoPor,
          });
        }
      }
    }
  }
  return fusionarPartes(partes);
}

function partesDeInformacion(d: {
  actor: { tipoParte: string; nombresApellidos: string; representadoPor: string }[];
  demandado: { tipoParte: string; nombresApellidos: string; representadoPor: string }[];
}): { tipo: string; nombre: string; representante: string }[] {
  return fusionarPartes(
    d.actor.map((p) => ({
      tipo: 'actor',
      nombre: p.nombresApellidos,
      representante: p.representadoPor,
    })),
    d.demandado.map((p) => ({
      tipo: 'demandado',
      nombre: p.nombresApellidos,
      representante: p.representadoPor,
    })),
  );
}

export async function informacionJuicio(idJuicio: string): Promise<DetalleJuicioSadje> {
  const [lista, incidentes] = await Promise.all([
    pedir(
      `${SVC_CAUSAS}/informacion/getInformacionJuicio/${encodeURIComponent(idJuicio)}`,
      { method: 'GET' },
      (x) => parseOrThrow(informacionJuicioListaSchema, x, 'informacionJuicio'),
      'informacionJuicio',
    ),
    listarIncidentes(idJuicio),
  ]);
  const d = lista[0];
  return {
    numeroJuicio: d?.numeroJuicio || numeroDesdeIdJuicio(idJuicio),
    estado: (d?.nombreEstadoJuicio || d?.estadoActual || '').trim(),
    materia: (d?.nombreMateria || d?.nombreDelito || '').trim(),
    tipoAccion: (d?.nombreTipoAccion || d?.nombreDelito || '').trim(),
    judicatura: (incidentes[0]?.nombreJudicatura || d?.nombreJudicatura || '').trim(),
    fechaIngreso: d?.fechaIngreso ?? '',
    partes: fusionarPartes(
      d ? partesDeInformacion(d) : [],
      partesDeIncidentes(incidentes),
    ),
  };
}

export interface ActuacionSadje {
  fecha: string;
  tipo: string;
  detalle: string;
}

type FiltroActuaciones = {
  idMovimientoJuicioIncidente: number;
  idJuicio: string;
  idJudicatura: string;
  idIncidenteJudicatura: number;
  aplicativo: string;
  nombreJudicatura: string;
  incidente: number;
};

async function pedirActuaciones(body: FiltroActuaciones): Promise<ActuacionSadje[]> {
  try {
    const items = await pedir(
      `${SVC_CAUSAS}/informacion/actuacionesJudiciales`,
      { method: 'POST', body: JSON.stringify(body) },
      (d) => parseOrThrow(actuacionesResponseSchema, d, 'actuacionesJudiciales'),
      'actuacionesJudiciales',
    );
    const out: ActuacionSadje[] = [];
    for (const a of items) {
      const fecha = normalizarFecha(a.fecha);
      if (!fecha) continue;
      const tipo = (a.tipo || a.actividad).trim();
      const detalle = textoPlano([a.actividad, a.detalle].filter(Boolean).join(' — '));
      out.push({ fecha, tipo, detalle });
    }
    return out;
  } catch (err) {
    logger.warn({ err, idJuicio: body.idJuicio }, 'actuacionesJudiciales falló');
    return [];
  }
}

export async function actuacionesJudiciales(params: {
  idJuicio: string;
  numeroJuicio: string;
}): Promise<ActuacionSadje[]> {
  const incidentes = await listarIncidentes(params.idJuicio);
  const vistas = new Set<string>();
  const out: ActuacionSadje[] = [];

  const bodies: FiltroActuaciones[] = [];
  for (const jud of incidentes) {
    for (const inc of jud.lstIncidenteJudicatura) {
      bodies.push({
        idMovimientoJuicioIncidente: Number(inc.idMovimientoJuicioIncidente) || 0,
        idJuicio: params.idJuicio,
        idJudicatura: jud.idJudicatura,
        idIncidenteJudicatura: Number(inc.idIncidenteJudicatura) || 0,
        aplicativo: 'web',
        nombreJudicatura: jud.nombreJudicatura,
        incidente: Number(inc.incidente) || 0,
      });
    }
  }
  // El portal igual consulta con ceros si no hay incidente (violencia/medidas).
  if (bodies.length === 0) {
    bodies.push({
      idMovimientoJuicioIncidente: 0,
      idJuicio: params.idJuicio,
      idJudicatura: params.idJuicio.replace(/\D/g, '').slice(0, 5),
      idIncidenteJudicatura: 0,
      aplicativo: 'web',
      nombreJudicatura: '',
      incidente: 1,
    });
  }

  for (const body of bodies) {
    const items = await pedirActuaciones(body);
    for (const a of items) {
      const key = `${a.fecha}|${a.tipo}|${a.detalle.slice(0, 80)}`;
      if (vistas.has(key)) continue;
      vistas.add(key);
      out.push(a);
    }
  }

  out.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return out;
}

/** e-SATJE devuelve fechas como ISO o `dd/MM/yyyy`; se normaliza a YYYY-MM-DD. */
function normalizarFecha(f: string): string {
  const iso = f.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = f.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  return f.slice(0, 10);
}
