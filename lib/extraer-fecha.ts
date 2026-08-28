/**
 * Extracción de fecha/hora de textos jurídicos en español de Ecuador
 * (PLAN §4.4.5 y §5.4). Devuelve `{ fecha: YYYY-MM-DD, hora?: HH:mm }` o null.
 */

import {
  esAbogadaOficina,
  esMismaPersona,
  nombrePocoFiable,
} from '@/lib/nombres';

const MESES: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  setiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
};

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extraerHora(texto: string): string | undefined {
  const m =
    texto.match(/\b([01]?\d|2[0-3])\s*h\s*([0-5]\d)\s*m?\b/i) ??
    texto.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/) ??
    texto.match(/\b([01]?\d|2[0-3])\s*h(?:oras)?\b/i);
  if (!m) return undefined;
  const hh = m[1]!.padStart(2, '0');
  const mm = (m[2] ?? '00').padStart(2, '0');
  return `${hh}:${mm}`;
}

export function extraerFechaHora(
  texto: string,
): { fecha: string; hora?: string } | null {
  const t = norm(texto);
  const hora = extraerHora(texto);

  // "d de <mes> de yyyy"  /  "d de <mes> del yyyy" (antes que ISO, para no
  // tomar la fecha de ingreso si el cuerpo también trae audiencia en letras).
  const textual = t.match(
    /\b(\d{1,2})\s+de\s+([a-zñ]+)\s+de[l]?\s+(\d{4})\b/,
  );
  if (textual) {
    const [, d, mesTxt, y] = textual;
    const mm = MESES[mesTxt!];
    if (mm) {
      return { fecha: `${y}-${mm}-${d!.padStart(2, '0')}`, hora };
    }
  }

  // dd/MM/yyyy  o  dd-MM-yyyy
  const numeric = t.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/);
  if (numeric) {
    const [, d, mo, y] = numeric;
    const dd = d!.padStart(2, '0');
    const mm = mo!.padStart(2, '0');
    if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) {
      return { fecha: `${y}-${mm}-${dd}`, hora };
    }
  }

  // Notificaciones SATJE: "Fecha de audiencia: 2026-10-07"
  const iso = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const mm = Number(iso[2]);
    const dd = Number(iso[3]);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return { fecha: `${iso[1]}-${iso[2]}-${iso[3]}`, hora };
    }
  }

  return null;
}

/** Prefiere la fecha junto a "audiencia"/"convoca"; no usa la de notificación. */
export function extraerFechaAudiencia(
  texto: string,
  fechaMinima?: string,
): { fecha: string; hora?: string } | null {
  const t = norm(texto);
  const candidatos: { fecha: string; hora?: string; prioridad: number }[] = [];

  const etiqueta = t.match(/fecha de audiencia\s*:\s*(\d{4}-\d{2}-\d{2})/);
  if (etiqueta) {
    candidatos.push({
      fecha: etiqueta[1]!,
      hora: extraerHora(texto),
      prioridad: 0,
    });
  }

  const bloquesConvocatoria = [
    ...texto.matchAll(
      /\b(convoc(a|o|ar|acion|ación)|señala|senala|fija|cita|tendra lugar|tendrá lugar)\b[\s\S]{0,180}/gi,
    ),
  ];
  for (const bloque of bloquesConvocatoria) {
    const frag = bloque[0]!;
    if (!/audiencia|diligencia|juzgamiento|conciliacion|conciliación/i.test(frag)) {
      continue;
    }
    const extraida = extraerFechaHora(frag);
    if (extraida) candidatos.push({ ...extraida, prioridad: 1 });
  }

  const idx = t.search(/audiencia|convoca|juzgamiento/);
  if (idx >= 0) {
    const ventana = texto.slice(Math.max(0, idx - 40), idx + 220);
    if (!/fecha de notificacion/i.test(norm(ventana))) {
      const cerca = extraerFechaHora(ventana);
      if (cerca) candidatos.push({ ...cerca, prioridad: 2 });
    }
  }

  const validos = candidatos.filter(
    (c) => !fechaMinima || c.fecha >= fechaMinima,
  );
  if (validos.length === 0) return null;

  validos.sort((a, b) => a.prioridad - b.prioridad || a.fecha.localeCompare(b.fecha));
  const mejor = validos[0]!;
  return { fecha: mejor.fecha, hora: mejor.hora };
}

function hayPalabra(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`).test(haystack);
}

function inferirTipoActuacion(texto: string): string {
  const u = norm(texto);
  const pares: [string, string][] = [
    ['sentencia', 'SENTENCIA'],
    ['auto de calificacion', 'AUTO DE CALIFICACIÓN'],
    ['auto interlocutorio', 'AUTO INTERLOCUTORIO'],
    ['providencia', 'PROVIDENCIA'],
    ['citacion', 'CITACIÓN'],
    ['razon', 'RAZÓN'],
    ['oficio', 'OFICIO'],
    ['audiencia', 'AUDIENCIA'],
    ['auto', 'AUTO'],
  ];
  for (const [needle, tipo] of pares) {
    if (hayPalabra(u, needle)) return tipo;
  }
  return 'NOTIFICACIÓN';
}

/**
 * Rellena fecha/tipo/detalle a partir del texto pegado de una notificación
 * del casillero electrónico (casos en que e-SATJE no publica el expediente).
 */
export function parsearNotificacion(texto: string): {
  fecha: string;
  tipo: string;
  detalle: string;
} {
  const detalle = texto.replace(/\r\n/g, '\n').trim();
  const extraida = extraerFechaAudiencia(detalle);
  return {
    fecha: extraida?.fecha ?? '',
    tipo: inferirTipoActuacion(detalle),
    detalle: detalle.slice(0, 20_000),
  };
}

/** Primer número de juicio, siempre con guiones (`01204-2018-05807`). */
export function extraerNumeroJuicio(texto: string): string | null {
  const dashed = texto.match(/\b\d{5}-\d{4}-\d{4,5}[A-Za-z]?\b/);
  if (dashed) return dashed[0].toUpperCase();
  const compact = texto.match(/\b\d{13,14}[A-Za-z]?\b/);
  if (!compact) return null;
  const id = compact[0].toUpperCase();
  const letra = /[A-Z]$/.test(id) ? id.slice(-1) : '';
  const d = id.replace(/\D/g, '');
  if (d.length < 13) return id;
  return `${d.slice(0, 5)}-${d.slice(5, 9)}-${d.slice(9)}${letra}`;
}

export interface NotificacionCasillero {
  numeroJuicio: string;
  fecha: string;
  destinatario: string;
  litigante: string;
  abogado: string;
  /** Nombre del cliente (litigante), nunca el de la abogada del estudio. */
  cliente: string;
  judicatura: string;
  instancia: string;
  tipo: string;
  detalle: string;
}

function lineaCaptura(texto: string, re: RegExp): string {
  const m = texto.match(re);
  return (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Parsea el correo típico del casillero electrónico (juicio, destinatario,
 * judicatura, auto). Sirve para crear la causa cuando e-SATJE no responde.
 */
export function parsearNotificacionCasillero(texto: string): NotificacionCasillero {
  const raw = texto.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
  const sinPie = raw
    .replace(/\n\*+[^*]*UTILIDAD SOLO PARA INFORMACI[OÓ]N\*+\s*$/i, '')
    .replace(/\nLa informaci[oó]n contenida en este mensaje[\s\S]*$/i, '')
    .trim();

  const numeroJuicio = extraerNumeroJuicio(sinPie) ?? '';
  const fechaLinea = lineaCaptura(sinPie, /Fecha de Notificaci[oó]n:\s*(.+)/i);
  const fecha = extraerFechaHora(fechaLinea)?.fecha ?? extraerFechaHora(sinPie)?.fecha ?? '';
  const destinatario = lineaCaptura(sinPie, /^\s*A:\s*(.+)$/im);
  const litigante = lineaCaptura(sinPie, /Nombre\s+Litigante:\s*([^\n]+)/i);
  const abogado = lineaCaptura(sinPie, /Dr\s*\/\s*Ab:\s*(.+)$/im);
  const cliente = clienteDesdeCasillero({ litigante, destinatario, abogado });

  const judicatura =
    lineaCaptura(
      sinPie,
      /^[ \t]*((?:SALA|UNIDAD JUDICIAL|JUZGADO|CORTE PROVINCIAL|CORTE NACIONAL)[^\n]+)$/im,
    ) || '';

  const instanciaMatch = sinPie.match(/SEGUNDA INSTANCIA|PRIMERA INSTANCIA/i);
  const instancia = instanciaMatch ? instanciaMatch[0].replace(/\s+/g, ' ').trim() : '';

  const cuerpoMatch = sinPie.match(
    /hay lo siguiente:\s*([\s\S]*?)(?=\n\s*f:\s|\n\s*Lo que comunico)/i,
  );
  const cuerpo = (cuerpoMatch?.[1] ?? sinPie).trim();

  return {
    numeroJuicio,
    fecha,
    destinatario,
    litigante,
    abogado,
    cliente,
    judicatura,
    instancia,
    tipo: inferirTipoActuacion(cuerpo),
    detalle: sinPie.slice(0, 20_000),
  };
}

/**
 * En el casillero siempre hay dos nombres: el de la abogada del estudio
 * (Dr/Ab, casillero) y el del cliente (Nombre Litigante). Nunca se usa
 * a la abogada como cliente.
 */
export function clienteDesdeCasillero(p: {
  litigante: string;
  destinatario: string;
  abogado: string;
}): string {
  const esEstudio = (n: string) =>
    !n ||
    nombrePocoFiable(n) ||
    esAbogadaOficina(n) ||
    esMismaPersona(n, p.abogado);

  const candidatos = [p.litigante, p.destinatario]
    .map((n) => n.replace(/\s+/g, ' ').trim())
    .filter((n) => n && !esEstudio(n))
    .sort((a, b) => b.length - a.length);

  return candidatos[0] ?? '';
}
