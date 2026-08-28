import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import cron, { type ScheduledTask } from 'node-cron';
import { sqlite } from '@/lib/db';
import { log } from '@/lib/logger';

const logger = log('backup');

const DATA_DIR = resolve(process.cwd(), 'data');
const BACKUPS_DIR = join(DATA_DIR, 'backups');
const STORAGE_DIR = resolve(process.cwd(), 'storage');
const RETENER = 30;
const TZ = 'America/Guayaquil';

/**
 * Backup nocturno (PLAN §0.1.5): `VACUUM INTO` a `data/backups/bufete-YYYY-MM-DD.db`,
 * conserva los últimos 30, y espeja la carpeta `storage/`.
 */
export function runBackup(): { archivo: string } {
  mkdirSync(BACKUPS_DIR, { recursive: true });

  const fecha = new Date()
    .toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
  const archivo = join(BACKUPS_DIR, `bufete-${fecha}.db`);

  const escapado = archivo.replace(/'/g, "''");
  sqlite.exec(`VACUUM INTO '${escapado}'`);
  logger.info({ archivo }, 'backup de BD creado');

  podarAntiguos();

  if (existsSync(STORAGE_DIR)) {
    const destino = join(BACKUPS_DIR, 'storage');
    cpSync(STORAGE_DIR, destino, { recursive: true, force: true });
    logger.info({ destino }, 'carpeta storage/ espejada');
  }

  return { archivo };
}

function podarAntiguos(): void {
  const backups = readdirSync(BACKUPS_DIR)
    .filter((f) => /^bufete-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .map((f) => ({ f, t: statSync(join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  for (const viejo of backups.slice(RETENER)) {
    rmSync(join(BACKUPS_DIR, viejo.f), { force: true });
    logger.info({ archivo: viejo.f }, 'backup antiguo eliminado');
  }
}

let task: ScheduledTask | null = null;

/** Registra el cron de las 02:00 (hora de Guayaquil). Idempotente. */
export function scheduleBackups(): void {
  if (task) return;
  task = cron.schedule(
    '0 2 * * *',
    () => {
      try {
        runBackup();
      } catch (err) {
        logger.error({ err }, 'fallo el backup nocturno');
      }
    },
    { timezone: TZ, name: 'backup-nocturno', noOverlap: true },
  );
  logger.info('backup nocturno programado (02:00 America/Guayaquil)');
}
