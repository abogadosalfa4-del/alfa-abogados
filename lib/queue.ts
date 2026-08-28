import PQueue from 'p-queue';

/**
 * Cola interna para trabajo pesado fuera del ciclo request/response
 * (PLAN §0.1.10): scraping SADJE, ingestión de PDFs, parsing de .msg,
 * resúmenes de correo. Concurrencia 2. Singleton por proceso.
 */
const globalForQueue = globalThis as unknown as { __bufeteQueue?: PQueue };

export const queue: PQueue =
  globalForQueue.__bufeteQueue ?? new PQueue({ concurrency: 2 });

if (!globalForQueue.__bufeteQueue) globalForQueue.__bufeteQueue = queue;
