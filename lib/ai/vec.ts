import { sqlite } from '@/lib/db';

/**
 * Acceso a la tabla virtual `rag_vec` (sqlite-vec). Si la extensión no está
 * cargada, `vecActivo()` devuelve false y el RAG usa búsqueda por palabras.
 */
export function vecActivo(): boolean {
  try {
    sqlite.prepare('SELECT count(*) FROM rag_vec').get();
    return true;
  } catch {
    return false;
  }
}

function blob(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

export function upsertVec(
  chunkId: string,
  embedding: number[],
  fuenteTipo: string,
  causaId: string | null,
): void {
  sqlite.prepare('DELETE FROM rag_vec WHERE chunk_id = ?').run(chunkId);
  sqlite
    .prepare(
      'INSERT INTO rag_vec(chunk_id, embedding, fuente_tipo, causa_id) VALUES (?, ?, ?, ?)',
    )
    .run(chunkId, blob(embedding), fuenteTipo, causaId ?? '');
}

export function borrarVecDeFuente(chunkIds: string[]): void {
  if (chunkIds.length === 0) return;
  const stmt = sqlite.prepare('DELETE FROM rag_vec WHERE chunk_id = ?');
  const tx = sqlite.transaction((ids: string[]) => ids.forEach((id) => stmt.run(id)));
  tx(chunkIds);
}

export interface VecHit {
  chunkId: string;
  distancia: number;
}

/** KNN con filtro de metadatos: siempre incluye códigos; opcionalmente una causa. */
export function buscarVec(
  embedding: number[],
  k: number,
  causaId: string | null,
): VecHit[] {
  const sql = causaId
    ? `SELECT chunk_id AS chunkId, distance AS distancia
         FROM rag_vec
        WHERE embedding MATCH ? AND k = ?
          AND (fuente_tipo = 'codigo' OR causa_id = ?)
        ORDER BY distance`
    : `SELECT chunk_id AS chunkId, distance AS distancia
         FROM rag_vec
        WHERE embedding MATCH ? AND k = ? AND fuente_tipo = 'codigo'
        ORDER BY distance`;
  const params = causaId ? [blob(embedding), k, causaId] : [blob(embedding), k];
  return sqlite.prepare(sql).all(...params) as VecHit[];
}
