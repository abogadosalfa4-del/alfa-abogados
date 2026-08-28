import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

/**
 * Zona horaria fija de la oficina (PLAN §0). Las fechas de negocio con hora se
 * guardan en UTC ISO-8601; las de calendario (`eventos.fecha`) son `YYYY-MM-DD`
 * en hora local de Guayaquil.
 */
export const TZ = 'America/Guayaquil';

/** Fecha de hoy en Guayaquil como `YYYY-MM-DD`. */
export function hoyISO(): string {
  return formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
}

/** `Date` (a medianoche local) a partir de `YYYY-MM-DD`. Útil para date-fns. */
export function fromYmd(ymd: string): Date {
  return parseISO(`${ymd}T00:00:00`);
}

export function toYmd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Rango de días visibles en la grilla mensual (semanas completas, lunes a domingo). */
export function gridMes(ancla: Date): { desde: string; hasta: string; dias: Date[] } {
  const inicio = startOfWeek(startOfMonth(ancla), { weekStartsOn: 1 });
  const fin = endOfWeek(endOfMonth(ancla), { weekStartsOn: 1 });
  return {
    desde: toYmd(inicio),
    hasta: toYmd(fin),
    dias: eachDayOfInterval({ start: inicio, end: fin }),
  };
}

export function gridSemana(ancla: Date): { desde: string; hasta: string; dias: Date[] } {
  const inicio = startOfWeek(ancla, { weekStartsOn: 1 });
  const fin = endOfWeek(ancla, { weekStartsOn: 1 });
  return {
    desde: toYmd(inicio),
    hasta: toYmd(fin),
    dias: eachDayOfInterval({ start: inicio, end: fin }),
  };
}

export function gridAgenda(
  ancla: Date,
  dias = 30,
): { desde: string; hasta: string; dias: Date[] } {
  const lista = Array.from({ length: dias }, (_, i) => addDays(ancla, i));
  return {
    desde: toYmd(lista[0]!),
    hasta: toYmd(lista[lista.length - 1]!),
    dias: lista,
  };
}

export function mesLegible(d: Date): string {
  return format(d, "LLLL 'de' yyyy", { locale: es });
}

export function diaCorto(d: Date): string {
  return format(d, 'EEE d', { locale: es });
}

/** Formatea un timestamp UTC ISO en hora de Guayaquil. */
export function formatoLocal(iso: string, patron = "d 'de' LLLL, HH:mm"): string {
  return formatInTimeZone(parseISO(iso), TZ, patron, { locale: es });
}

/** Fecha de ingreso SATJE (ISO o `YYYY-MM-DD`) en español, o el original si no parsea. */
export function fechaExpediente(valor: string | null | undefined): string {
  if (!valor) return '';
  try {
    if (/^\d{4}-\d{2}-\d{2}T/.test(valor)) {
      return formatoLocal(valor, "d 'de' LLLL yyyy");
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return format(parseISO(valor), "d 'de' LLLL yyyy", { locale: es });
    }
  } catch {
    return valor;
  }
  return valor;
}

/** «hace 3 min», «hace 2 h», «ayer»… a partir de un ISO UTC. */
export function haceCuanto(iso: string): string {
  const then = toZonedTime(parseISO(iso), TZ).getTime();
  const now = toZonedTime(new Date(), TZ).getTime();
  const seg = Math.round((now - then) / 1000);
  if (seg < 45) return 'hace un momento';
  if (seg < 90) return 'hace 1 min';
  const min = Math.round(seg / 60);
  if (min < 45) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

export {
  addDays,
  addMonths,
  differenceInCalendarDays,
  parseISO,
  format as formatDate,
};
