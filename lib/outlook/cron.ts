import { eq } from 'drizzle-orm';
import cron, { type ScheduledTask } from 'node-cron';
import { db } from '@/lib/db';
import { graphTokens, user } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { generarResumen } from '@/lib/outlook/resumen';
import {
  ingestarCasilleroAcumulado,
  ingestarCasilleroDesdeBuzon,
} from '@/lib/outlook/casillero';
import { estadoImap, userIdImap } from '@/lib/outlook/imap';
import { estadoOutbite } from '@/lib/outlook/outbite';

const logger = log('correos');
const TZ = 'America/Guayaquil';
let task: ScheduledTask | null = null;

function primerAdminId(): string | null {
  return (
    db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, 'admin'))
      .get()?.id ?? null
  );
}

function actorCasillero(): string | null {
  return (
    userIdImap() ??
    primerAdminId() ??
    db.select({ userId: graphTokens.userId }).from(graphTokens).get()?.userId ??
    null
  );
}

/** Al prender: inyecta todo lo acumulado en outbite.app mientras la app estaba apagada. */
export async function ingestarCasilleroAlArranque(): Promise<void> {
  const actor = actorCasillero();
  if (!actor) return;
  if (!estadoOutbite().configurado && !estadoImap().conectado) return;
  try {
    logger.info('inyectando casillero acumulado al arranque');
    const r = await ingestarCasilleroAcumulado(actor);
    logger.info(r, 'casillero al arranque listo');
  } catch (err) {
    logger.warn({ err }, 'casillero al arranque falló');
  }
}

/** Casillero outbite.app (o IMAP/Graph) + resumen Outlook cada 15 min. */
export function scheduleResumenCorreos(): void {
  if (task) return;
  task = cron.schedule(
    '*/15 * * * *',
    async () => {
      const actor = actorCasillero();
      const hayBuzon = estadoOutbite().configurado || estadoImap().conectado;

      if (hayBuzon && actor) {
        try {
          await ingestarCasilleroAcumulado(actor);
        } catch (err) {
          logger.warn({ err, userId: actor }, 'ingesta casillero falló');
        }
      }

      const filasGraph = db.select({ userId: graphTokens.userId }).from(graphTokens).all();
      for (const f of filasGraph) {
        if (!hayBuzon) {
          try {
            await ingestarCasilleroDesdeBuzon(f.userId, { dias: 14 });
          } catch (err) {
            logger.warn({ err, userId: f.userId }, 'ingesta casillero Graph falló');
          }
        }
        try {
          await generarResumen(f.userId, { forzar: true });
        } catch (err) {
          logger.warn({ err, userId: f.userId }, 'refresco de correos falló');
        }
      }
    },
    { timezone: TZ, name: 'resumen-correos', noOverlap: true },
  );
  logger.info('refresco de correos y casillero programado (cada 15 min)');
}
