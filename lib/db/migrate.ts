import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, sqlite } from '@/lib/db';
import { runPostMigrate } from '@/lib/db/post-migrate';

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

/**
 * Aplica todas las migraciones pendientes de Drizzle + el DDL post-migración.
 * Idempotente: seguro llamarlo en cada boot (PLAN §1.1 / §2).
 */
export function runMigrations(): void {
  migrate(db, { migrationsFolder });
  runPostMigrate(sqlite);
}
