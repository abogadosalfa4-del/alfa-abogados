import { uuidv7 } from 'uuidv7';
import { queue } from '@/lib/queue';
import { log } from '@/lib/logger';
import { buscarCausas } from '@/lib/sadje/client';
import { SadjeSchemaError, SadjeUnavailableError } from '@/lib/sadje/errors';
import { importarCausaSadje, sincronizarCausa } from '@/lib/causas';
import { idsCausasDeCliente } from '@/lib/clientes';
import { crearNotificacion } from '@/lib/notificaciones';
import { emitToUser } from '@/lib/realtime/socket-server';
import type { BuscarSadje } from '@/lib/schemas/causa';

const logger = log('sadje-jobs');

interface Actor {
  userId: string;
  role: string;
}

function esError(err: unknown): { code: string; message: string } {
  if (err instanceof SadjeSchemaError) return { code: 'schema', message: err.message };
  if (err instanceof SadjeUnavailableError) return { code: 'no_disponible', message: err.message };
  return { code: 'error', message: err instanceof Error ? err.message : 'Error consultando e-SATJE' };
}

function fusionarPorId(
  ...listas: Awaited<ReturnType<typeof buscarCausas>>[]
): Awaited<ReturnType<typeof buscarCausas>> {
  const map = new Map<string, Awaited<ReturnType<typeof buscarCausas>>[number]>();
  for (const lista of listas) {
    for (const item of lista) map.set(item.idJuicio, item);
  }
  return [...map.values()];
}

/** Encola una búsqueda en e-SATJE. Responde de inmediato con el jobId (§5.2). */
export function encolarBusquedaSadje(params: BuscarSadje, actor: Actor): string {
  const jobId = uuidv7();
  void queue.add(async () => {
    try {
      // e-SATJE trata actor+demandado en el mismo body como AND. Una cédula
      // en ambos lados no matchea a nadie; hay que consultar cada rol aparte.
      let resultados: Awaited<ReturnType<typeof buscarCausas>>;
      if (params.cedula) {
        const [comoActor, comoDemandado] = await Promise.all([
          buscarCausas({ cedulaActor: params.cedula }),
          buscarCausas({ cedulaDemandado: params.cedula }),
        ]);
        resultados = fusionarPorId(comoActor, comoDemandado);
      } else if (params.nombre) {
        const [comoActor, comoDemandado] = await Promise.all([
          buscarCausas({ nombreActor: params.nombre }),
          buscarCausas({ nombreDemandado: params.nombre }),
        ]);
        resultados = fusionarPorId(comoActor, comoDemandado);
      } else {
        resultados = await buscarCausas({ numeroCausa: params.numeroJuicio });
      }
      logger.info({ jobId, n: resultados.length }, 'búsqueda SADJE ok');
      emitToUser(actor.userId, {
        t: 'sadje:resultado',
        jobId,
        ok: true,
        data: { tipo: 'busqueda', resultados },
      });
    } catch (err) {
      const e = esError(err);
      logger.warn({ err, jobId }, 'búsqueda SADJE falló');
      emitToUser(actor.userId, { t: 'sadje:resultado', jobId, ok: false, error: e.message });
      crearNotificacion({
        userId: actor.userId,
        tipo: 'sadje-error',
        mensaje: `SADJE no disponible: ${e.message}`,
      });
    }
  });
  return jobId;
}

/** Encola la sincronización de una causa. */
export function encolarSincronizacion(
  causaId: string,
  actor: Actor,
  opts: { ignorarCache?: boolean } = {},
): string {
  const jobId = causaId;
  void queue.add(async () => {
    try {
      await sincronizarCausa(causaId, actor, opts);
    } catch (err) {
      const e = esError(err);
      logger.warn({ err, causaId }, 'sincronización SADJE falló');
      emitToUser(actor.userId, { t: 'sadje:resultado', jobId, ok: false, error: e.message });
      crearNotificacion({
        userId: actor.userId,
        tipo: 'sadje-error',
        mensaje: `No se pudo sincronizar: ${e.message}`,
        link: `/causas/${causaId}`,
      });
    }
  });
  return jobId;
}

/** Sincroniza en segundo plano las causas del cliente (si nunca o hace >12 h). */
export function encolarSincronizacionCliente(clienteId: string, actor: Actor): string[] {
  const filas = idsCausasDeCliente(clienteId);
  const ahora = Date.now();
  const staleMs = 12 * 60 * 60 * 1000;
  return filas
    .filter((c) => {
      if (!c.ultimaSincronizacion) return true;
      const t = Date.parse(c.ultimaSincronizacion);
      return Number.isNaN(t) || ahora - t > staleMs;
    })
    .map((c) => encolarSincronizacion(c.id, actor, { ignorarCache: !c.ultimaSincronizacion }));
}

/** Encola la importación de una causa desde un resultado de búsqueda. */
export function encolarImportacion(
  resumen: Parameters<typeof importarCausaSadje>[0],
  clienteId: string | null,
  actor: Actor,
): string {
  const jobId = uuidv7();
  void queue.add(async () => {
    try {
      const causa = await importarCausaSadje(resumen, clienteId, actor);
      emitToUser(actor.userId, {
        t: 'sadje:resultado',
        jobId,
        ok: true,
        data: { tipo: 'importada', causaId: causa.id, numeroJuicio: causa.numeroJuicio },
      });
    } catch (err) {
      const e = esError(err);
      emitToUser(actor.userId, { t: 'sadje:resultado', jobId, ok: false, error: e.message });
      crearNotificacion({ userId: actor.userId, tipo: 'sadje-error', mensaje: e.message });
    }
  });
  return jobId;
}
