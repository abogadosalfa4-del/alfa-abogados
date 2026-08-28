/** Ordenamiento fraccional del kanban (PLAN §7.3). Puro, cliente y servidor. */

export const ORDEN_GAP = 1000;

export function ordenEntre(
  antes: number | null,
  despues: number | null,
): number {
  if (antes == null && despues == null) return ORDEN_GAP;
  if (antes == null) return (despues as number) - ORDEN_GAP;
  if (despues == null) return antes + ORDEN_GAP;
  return (antes + despues) / 2;
}
