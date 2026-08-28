/**
 * Etiquetas rápidas del calendario. El chip muestra una de estas; el juzgado
 * y el resto de campos van en Detalles. Si falta juicio o cliente, el casillero
 * debió mandarlos: se muestra como error del sistema, no se oculta.
 */

export const ETIQUETAS_EVENTO = [
  'AUDIENCIA',
  'CONTESTAR DEMANDA',
  'COMPLETAR DEMANDA',
  'APELAR',
  'RECURSO',
  'CITACIÓN',
  'SENTENCIA',
  'PROVIDENCIA',
  'OFICIO',
  'ESCRITO',
  'DILIGENCIA',
] as const;

export type EtiquetaEvento = (typeof ETIQUETAS_EVENTO)[number];

export type TipoEvento = 'escrito' | 'audiencia' | 'diligencia';

export const ETIQUETA_A_TIPO: Record<EtiquetaEvento, TipoEvento> = {
  AUDIENCIA: 'audiencia',
  'CONTESTAR DEMANDA': 'escrito',
  'COMPLETAR DEMANDA': 'escrito',
  APELAR: 'escrito',
  RECURSO: 'escrito',
  CITACIÓN: 'diligencia',
  SENTENCIA: 'diligencia',
  PROVIDENCIA: 'diligencia',
  OFICIO: 'diligencia',
  ESCRITO: 'escrito',
  DILIGENCIA: 'diligencia',
};

export const FALLO_JUICIO = 'SIN JUICIO — error del sistema';
export const FALLO_CLIENTE = 'SIN CLIENTE — error del sistema';
export const FALLO_JUZGADO = 'SIN JUZGADO — error del sistema';
export const FALLO_MATERIA = 'SIN MATERIA — error del sistema';

export function textoJuicio(n: string | null | undefined): string {
  const t = n?.trim();
  return t ? t : FALLO_JUICIO;
}

export function textoCliente(n: string | null | undefined): string {
  const t = n?.trim();
  return t ? t : FALLO_CLIENTE;
}

export function textoJuzgado(n: string | null | undefined): string {
  const t = n?.trim();
  return t ? t : FALLO_JUZGADO;
}

export function textoMateria(n: string | null | undefined): string {
  const t = n?.trim();
  return t ? t : FALLO_MATERIA;
}

export function esFalloSistema(valor: string): boolean {
  return valor.includes('error del sistema');
}

/** En el chip: el número o SIN JUICIO / SIN CLIENTE, sin el sufijo largo. */
export function textoJuicioCorto(n: string | null | undefined): string {
  return n?.trim() || 'SIN JUICIO';
}

export function textoClienteCorto(n: string | null | undefined): string {
  return n?.trim() || 'SIN CLIENTE';
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const REGLAS: { etiqueta: EtiquetaEvento; pruebas: RegExp[] }[] = [
  {
    etiqueta: 'COMPLETAR DEMANDA',
    pruebas: [
      /completar\s+(la\s+)?demanda/,
      /subsanar/,
      /calificacion\s+de\s+la\s+demanda/,
      /auto de calificacion/,
    ],
  },
  {
    etiqueta: 'CONTESTAR DEMANDA',
    pruebas: [/contestar/, /contestacion/, /traslado/],
  },
  { etiqueta: 'APELAR', pruebas: [/apelac/, /\bapelar\b/] },
  { etiqueta: 'RECURSO', pruebas: [/\brecurso\b/] },
  { etiqueta: 'AUDIENCIA', pruebas: [/audiencia/, /convocase/, /convoca a/] },
  { etiqueta: 'CITACIÓN', pruebas: [/citacion/] },
  { etiqueta: 'SENTENCIA', pruebas: [/sentencia/] },
  { etiqueta: 'PROVIDENCIA', pruebas: [/providencia/] },
  { etiqueta: 'OFICIO', pruebas: [/\boficio\b/] },
];

export function inferirEtiqueta(
  texto: string,
  tipo?: TipoEvento | null,
): EtiquetaEvento {
  const t = norm(texto);
  const exacta = ETIQUETAS_EVENTO.find(
    (e) => t === norm(e) || t.startsWith(`${norm(e)} `) || t.startsWith(`${norm(e)}—`) || t.startsWith(`${norm(e)}-`),
  );
  if (exacta) return exacta;
  for (const r of REGLAS) {
    if (r.pruebas.some((re) => re.test(t))) return r.etiqueta;
  }
  if (tipo === 'audiencia') return 'AUDIENCIA';
  if (tipo === 'escrito') return 'ESCRITO';
  return 'DILIGENCIA';
}

export const ORIGEN_EVENTO: Record<string, string> = {
  manual: 'Manual',
  correo: 'Casillero',
  'sadje-regla': 'e-SATJE',
};

export const ESTADO_EVENTO: Record<string, string> = {
  pendiente: 'Pendiente',
  cumplido: 'Cumplido',
  cancelado: 'Cancelado',
};
