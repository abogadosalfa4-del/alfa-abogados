import type { Database } from 'better-sqlite3';

/**
 * DDL idempotente que Drizzle no modela (índices con COLLATE, tablas virtuales
 * de sqlite-vec, triggers). Se ejecuta después de las migraciones de Drizzle,
 * tanto en `scripts/migrate.ts` como al boot en `server.ts`.
 */
export function runPostMigrate(sqlite: Database): void {
  // ── Índice de búsqueda de clientes por nombre, case/acento-insensitivo ──────
  // (PLAN §2: idx_clientes_nombre sobre nombre_completo COLLATE NOCASE)
  sqlite.exec(`
    DROP INDEX IF EXISTS idx_clientes_nombre;
    CREATE INDEX IF NOT EXISTS idx_clientes_nombre
      ON clientes (nombre_completo COLLATE NOCASE);
  `);

  // ── Tabla virtual vectorial para RAG (Sección 3/6) ─────────────────────────
  // Solo se crea si la extensión sqlite-vec está cargada en esta conexión.
  // La ingestión (Fase 6) carga la extensión antes de llamar aquí.
  const hasVec = vecLoaded(sqlite);
  if (hasVec) {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS rag_vec USING vec0(
        chunk_id TEXT PRIMARY KEY,
        embedding FLOAT[1536],
        fuente_tipo TEXT,
        causa_id TEXT
      );
    `);
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS correos_casillero (
      id TEXT PRIMARY KEY,
      graph_message_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      causa_id TEXT,
      internet_message_id TEXT,
      received_at TEXT,
      asunto TEXT,
      remitente TEXT,
      cuerpo TEXT,
      numero_juicio TEXT,
      leido INTEGER NOT NULL DEFAULT 0,
      leido_at TEXT,
      estado TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_correos_casillero_user
      ON correos_casillero (user_id);

    CREATE TABLE IF NOT EXISTS imap_casillero (
      id TEXT PRIMARY KEY,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      usuario TEXT NOT NULL,
      password_cifrado TEXT NOT NULL,
      configurado_por TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  tryExec(sqlite, `ALTER TABLE correos_casillero ADD COLUMN remitente TEXT`);
  tryExec(sqlite, `ALTER TABLE correos_casillero ADD COLUMN cuerpo TEXT`);
  tryExec(sqlite, `ALTER TABLE correos_casillero ADD COLUMN numero_juicio TEXT`);
  tryExec(
    sqlite,
    `ALTER TABLE correos_casillero ADD COLUMN leido INTEGER NOT NULL DEFAULT 0`,
  );
  tryExec(sqlite, `ALTER TABLE correos_casillero ADD COLUMN leido_at TEXT`);
  tryExec(
    sqlite,
    `
    UPDATE correos_casillero
    SET cuerpo = (
      SELECT a.detalle FROM actuaciones a
      WHERE a.causa_id = correos_casillero.causa_id
        AND a.origen = 'correo'
      ORDER BY a.created_at DESC
      LIMIT 1
    )
    WHERE cuerpo IS NULL AND causa_id IS NOT NULL
    `,
  );
}

function tryExec(sqlite: Database, ddl: string): void {
  try {
    sqlite.exec(ddl);
  } catch {
    /* columna o tabla ya existe */
  }
}

function vecLoaded(sqlite: Database): boolean {
  try {
    const row = sqlite
      .prepare(`SELECT vec_version() AS v`)
      .get() as { v: string } | undefined;
    return Boolean(row?.v);
  } catch {
    return false;
  }
}
