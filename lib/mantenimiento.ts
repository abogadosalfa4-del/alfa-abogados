import cron, { type ScheduledTask } from 'node-cron';
import { lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { idempotencyKeys, sadjeCache } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { renormalizarOrden } from '@/lib/tareas';
import { notificarVencimientosProximos } from '@/lib/notificaciones';

const logger = log('mantenimiento');
const TZ = 'America/Guayaquil';
let tareas: ScheduledTask[] = [];

/** Limpieza nocturna + renormalización de orden del kanban (PLAN §7.3). */
export function ejecutarMantenimientoNocturno(): void {
  const nowIso = new Date().toISOString();
  const idem = db.delete(idempotencyKeys).where(lt(idempotencyKeys.expiraAt, nowIso)).run();
  const cache = db.delete(sadjeCache).where(lt(sadjeCache.expiraAt, nowIso)).run();
  const orden = renormalizarOrden();
  logger.info(
    { idempotencyBorradas: idem.changes, cacheBorrada: cache.changes, tareasRenormalizadas: orden },
    'mantenimiento nocturno',
  );
}

/**
 * Programa (PLAN §8 / §11):
 *   - 02:15 mantenimiento (limpieza + renormalización)
 *   - 07:00 notificación de vencimientos de escritos a ≤3 días hábiles
 */
export function scheduleMantenimiento(): void {
  if (tareas.length) return;
  tareas = [
    cron.schedule(
      '15 2 * * *',
      () => {
        try {
          ejecutarMantenimientoNocturno();
        } catch (err) {
          logger.error({ err }, 'fallo mantenimiento nocturno');
        }
      },
      { timezone: TZ, name: 'mantenimiento-nocturno', noOverlap: true },
    ),
    cron.schedule(
      '0 7 * * *',
      () => {
        try {
          const n = notificarVencimientosProximos();
          logger.info({ notificaciones: n }, 'aviso de vencimientos 07:00');
        } catch (err) {
          logger.error({ err }, 'fallo aviso de vencimientos');
        }
      },
      { timezone: TZ, name: 'aviso-vencimientos', noOverlap: true },
    ),
  ];
  logger.info('mantenimiento y avisos programados (02:15 y 07:00)');
}
