import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { feriados } from '@/lib/db/schema';
import { fromYmd, toYmd, addDays } from '@/lib/fechas';

/**
 * Feriados de Ecuador (PLAN §5.4.2) + cálculo de días hábiles para el motor de
 * plazos (§5.4). Tabla `feriados` editable por el admin en /admin/feriados.
 *
 * Los valores movibles (Carnaval, Viernes Santo) y los "puente" oficiales se
 * cargan explícitamente por año y quedan documentados como "verificar".
 */

interface Feriado {
  fecha: string; // YYYY-MM-DD
  nombre: string;
}

// Feriados de fecha fija (se generan para varios años).
const FIJOS: { md: string; nombre: string }[] = [
  { md: '01-01', nombre: 'Año Nuevo' },
  { md: '04-12', nombre: 'Fundación de Cuenca' },
  { md: '05-01', nombre: 'Día del Trabajo' },
  { md: '05-24', nombre: 'Batalla de Pichincha' },
  { md: '08-10', nombre: 'Primer Grito de Independencia' },
  { md: '10-09', nombre: 'Independencia de Guayaquil' },
  { md: '11-02', nombre: 'Día de los Difuntos' },
  { md: '11-03', nombre: 'Independencia de Cuenca' },
  { md: '12-25', nombre: 'Navidad' },
];

// Feriados movibles (Carnaval = lunes y martes previos al Miércoles de Ceniza;
// Viernes Santo). Verificar contra el calendario oficial vigente.
const MOVIBLES: Feriado[] = [
  { fecha: '2025-03-03', nombre: 'Carnaval' },
  { fecha: '2025-03-04', nombre: 'Carnaval' },
  { fecha: '2025-04-18', nombre: 'Viernes Santo' },
  { fecha: '2026-02-16', nombre: 'Carnaval' },
  { fecha: '2026-02-17', nombre: 'Carnaval' },
  { fecha: '2026-04-03', nombre: 'Viernes Santo' },
  { fecha: '2027-02-08', nombre: 'Carnaval' },
  { fecha: '2027-02-09', nombre: 'Carnaval' },
  { fecha: '2027-03-26', nombre: 'Viernes Santo' },
];

const ANIOS = [2025, 2026, 2027, 2028];

export function feriadosPorDefecto(): Feriado[] {
  const lista: Feriado[] = [...MOVIBLES];
  for (const anio of ANIOS) {
    for (const f of FIJOS) {
      lista.push({ fecha: `${anio}-${f.md}`, nombre: f.nombre });
    }
  }
  return lista;
}

/** Idempotente: inserta los feriados por defecto que aún no existan. */
export function seedFeriados(): number {
  let insertados = 0;
  db.transaction((tx) => {
    for (const f of feriadosPorDefecto()) {
      const existe = tx
        .select({ fecha: feriados.fecha })
        .from(feriados)
        .where(eq(feriados.fecha, f.fecha))
        .get();
      if (!existe) {
        tx.insert(feriados).values(f).run();
        insertados++;
      }
    }
  });
  return insertados;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo de días hábiles / calendario
// ─────────────────────────────────────────────────────────────────────────────

let cacheFeriados: Set<string> | null = null;

export function invalidarCacheFeriados(): void {
  cacheFeriados = null;
}

function setFeriados(): Set<string> {
  if (!cacheFeriados) {
    const filas = db.select({ fecha: feriados.fecha }).from(feriados).all();
    cacheFeriados = new Set(filas.map((f) => f.fecha));
  }
  return cacheFeriados;
}

/** ¿`ymd` es día hábil? (no sábado, no domingo, no feriado). */
export function esDiaHabil(ymd: string): boolean {
  const d = fromYmd(ymd);
  const dow = d.getDay(); // 0 domingo, 6 sábado
  if (dow === 0 || dow === 6) return false;
  return !setFeriados().has(ymd);
}

/** Primer día hábil en o después de `ymd`. */
export function siguienteDiaHabil(ymd: string): string {
  let cur = ymd;
  while (!esDiaHabil(cur)) cur = toYmd(addDays(fromYmd(cur), 1));
  return cur;
}

/**
 * Suma `dias` días HÁBILES a partir de `desde` (exclusivo). Empieza a contar
 * desde el día hábil siguiente (regla COGEP art. 73).
 */
export function sumarDiasHabiles(desde: string, dias: number): string {
  let cur = desde;
  let contados = 0;
  while (contados < dias) {
    cur = toYmd(addDays(fromYmd(cur), 1));
    if (esDiaHabil(cur)) contados++;
  }
  return cur;
}

/** Suma `dias` días CALENDARIO; si el vencimiento cae inhábil, pasa al siguiente hábil. */
export function sumarDiasCalendario(desde: string, dias: number): string {
  const venc = toYmd(addDays(fromYmd(desde), dias));
  return siguienteDiaHabil(venc);
}
