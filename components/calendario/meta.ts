import type { Evento } from '@/lib/db/schema';

/**
 * Codificación visual FIJA de eventos (PLAN §4.1):
 *   escrito    = rojo   (es lo que pierde juicios)
 *   audiencia  = azul primario
 *   diligencia = ámbar
 */
export const TIPO_META: Record<
  Evento['tipo'],
  { label: string; color: string; chipClass: string; dotClass: string }
> = {
  escrito: {
    label: 'Escrito',
    color: 'var(--evento-escrito)',
    chipClass:
      'bg-destructive/10 text-destructive border-l-2 border-destructive',
    dotClass: 'bg-destructive',
  },
  audiencia: {
    label: 'Audiencia',
    color: 'var(--evento-audiencia)',
    chipClass: 'bg-primary/10 text-primary border-l-2 border-primary',
    dotClass: 'bg-primary',
  },
  diligencia: {
    label: 'Diligencia',
    color: 'var(--evento-diligencia)',
    chipClass:
      'bg-warning/15 text-warning-foreground border-l-2 border-warning',
    dotClass: 'bg-warning',
  },
};

/** Orden para listados: escritos primero (PLAN §4.1 panel próximos 7 días). */
export const ORDEN_TIPO: Record<Evento['tipo'], number> = {
  escrito: 0,
  audiencia: 1,
  diligencia: 2,
};
