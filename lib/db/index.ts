import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { env } from '@/lib/env';
import * as schema from '@/lib/db/schema';

/**
 * Instancia única de better-sqlite3 + Drizzle (PLAN §1 / §0.1).
 *
 * Pragmas obligatorios:
 *   journal_mode=WAL     → escrituras concurrentes sin bloquear lecturas
 *   synchronous=NORMAL    → durabilidad suficiente con WAL, mucho más rápido
 *   busy_timeout=5000     → reintenta 5 s antes de SQLITE_BUSY
 *   foreign_keys=ON       → integridad referencial real
 *
 * Se cachea en globalThis para sobrevivir al HMR de Next en desarrollo
 * (evita abrir decenas de conexiones al mismo archivo).
 */

function createConnection() {
  const dbPath = resolve(process.cwd(), env.DATABASE_PATH);
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  // Mejora el planificador con estadísticas al cerrar / periódicamente.
  sqlite.pragma('optimize');

  // Extensión vectorial para el RAG (Sección 3/6). Si falla, el RAG cae a
  // búsqueda por palabras clave.
  try {
    sqliteVec.load(sqlite);
  } catch {
    // sin sqlite-vec: rag_vec no se crea y la recuperación usa LIKE.
  }

  const orm = drizzle(sqlite, { schema });
  return { sqlite, orm };
}

type Conn = ReturnType<typeof createConnection>;

const globalForDb = globalThis as unknown as { __bufeteDb?: Conn };

const conn: Conn = globalForDb.__bufeteDb ?? createConnection();
if (process.env.NODE_ENV !== 'production') globalForDb.__bufeteDb = conn;

export const sqlite = conn.sqlite;
export const db = conn.orm;
export { schema };
