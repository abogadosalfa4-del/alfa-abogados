/**
 * Nombres del casillero: el litigante es el cliente;
 * Dra. Samantha Merchán es la abogada del estudio, nunca el cliente.
 */

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-zñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'e']);
const TITULOS = new Set(['dra', 'dr', 'abg', 'abogada', 'abogado']);

export function tokensNombre(nombre: string): string[] {
  return norm(nombre)
    .split(' ')
    .filter((t) => t.length > 2 && !PARTICULAS.has(t) && !TITULOS.has(t));
}

export function esMismaPersona(a: string, b: string): boolean {
  if (!a.trim() || !b.trim()) return false;
  const ta = tokensNombre(a);
  const tb = tokensNombre(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const setB = new Set(tb);
  const inter = ta.filter((t) => setB.has(t)).length;
  const min = Math.min(ta.length, tb.length);
  if (inter === min && min >= 2) return true;
  if (inter >= 3) return true;
  return false;
}

/** Abogada del despacho (casillero 0102046059). No es cliente. */
const ABOGADAS_OFICINA = [
  'SAMANTHA DEL ROCIO MERCHAN CASTILLO',
  'MERCHAN CASTILLO SAMANTHA DEL ROCIO',
  'SAMANTHA MERCHAN',
  'DRA SAMANTHA MERCHAN',
];

export function esAbogadaOficina(nombre: string): boolean {
  if (!nombre.trim()) return false;
  return ABOGADAS_OFICINA.some((a) => esMismaPersona(nombre, a));
}

/** Nombres rotos del casillero ("A: TOR", "MA CLA PA RO"). */
export function nombrePocoFiable(nombre: string): boolean {
  const t = nombre.trim();
  if (t.replace(/\s/g, '').length < 8) return true;
  const partes = t.split(/\s+/);
  if (partes.length >= 3 && partes.every((p) => p.length <= 3)) return true;
  return false;
}
