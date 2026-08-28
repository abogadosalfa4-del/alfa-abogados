/**
 * Rate limit interno al portal de la Función Judicial (PLAN §0.1.11):
 * máx. 1 request cada 2 segundos, compartido por todo el proceso (singleton).
 */
const MIN_INTERVALO_MS = 2000;

const g = globalThis as unknown as { __sadjeRL?: { ultima: number; cola: Promise<void> } };
const estado = (g.__sadjeRL ??= { ultima: 0, cola: Promise.resolve() });

export function esperarTurno(): Promise<void> {
  const siguiente = estado.cola.then(async () => {
    const ahora = Date.now();
    const espera = Math.max(0, estado.ultima + MIN_INTERVALO_MS - ahora);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    estado.ultima = Date.now();
  });
  estado.cola = siguiente.catch(() => undefined);
  return siguiente;
}
