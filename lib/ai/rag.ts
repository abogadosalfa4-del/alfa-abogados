import { and, eq, like, or, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db, sqlite } from '@/lib/db';
import { archivos, ragChunks } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { embeder, embederUno } from '@/lib/ai/embeddings';
import { borrarVecDeFuente, upsertVec, vecActivo } from '@/lib/ai/vec';
import { emitToUser } from '@/lib/realtime/socket-server';

const logger = log('rag');

const CHARS_POR_TOKEN = 4;
const MAX_ART_CHARS = 1500 * CHARS_POR_TOKEN;
const ARCHIVO_CHUNK_CHARS = 800 * CHARS_POR_TOKEN;
const ARCHIVO_OVERLAP_CHARS = 150 * CHARS_POR_TOKEN;
const UMBRAL_DISTANCIA = 0.6;

// ─────────────────────────────────────────────────────────────────────────────
// Chunking
// ─────────────────────────────────────────────────────────────────────────────

/** Divide un código legal por artículo (PLAN §6.3). */
export function chunkearCodigo(texto: string): { titulo: string; contenido: string }[] {
  const limpio = texto.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  const partes = limpio.split(/(?=Art(?:ículo|\.)\s*\d+)/i).filter((p) => p.trim().length > 20);
  const chunks: { titulo: string; contenido: string }[] = [];
  for (const parte of partes) {
    const m = parte.match(/Art(?:ículo|\.)\s*(\d+[A-Za-z-]*)/i);
    const titulo = m ? `Art. ${m[1]}` : 'Fragmento';
    if (parte.length <= MAX_ART_CHARS) {
      chunks.push({ titulo, contenido: parte.trim() });
      continue;
    }
    // Sub-split por párrafo con solape.
    const parrafos = parte.split(/\n\n+/);
    let buffer = '';
    for (const p of parrafos) {
      if ((buffer + '\n\n' + p).length > MAX_ART_CHARS && buffer) {
        chunks.push({ titulo, contenido: buffer.trim() });
        buffer = buffer.slice(-100) + '\n\n' + p;
      } else {
        buffer = buffer ? `${buffer}\n\n${p}` : p;
      }
    }
    if (buffer.trim()) chunks.push({ titulo, contenido: buffer.trim() });
  }
  return chunks;
}

/** Divide un documento genérico en ventanas con solape (PLAN §6.3). */
export function chunkearArchivo(texto: string): string[] {
  const limpio = texto.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (limpio.length <= ARCHIVO_CHUNK_CHARS) return limpio ? [limpio] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < limpio.length) {
    chunks.push(limpio.slice(i, i + ARCHIVO_CHUNK_CHARS));
    i += ARCHIVO_CHUNK_CHARS - ARCHIVO_OVERLAP_CHARS;
  }
  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingestión
// ─────────────────────────────────────────────────────────────────────────────

interface IngestaResultado {
  chunks: number;
  conEmbeddings: boolean;
}

async function guardarChunks(
  params: {
    fuenteTipo: 'codigo' | 'archivo_causa';
    fuenteId: string;
    causaId: string | null;
    tituloFuente: string;
    items: { titulo: string; contenido: string }[];
    progreso?: (pct: number) => void;
  },
): Promise<IngestaResultado> {
  // Re-ingestión idempotente: borrar chunks previos de la fuente.
  const previos = db
    .select({ id: ragChunks.id })
    .from(ragChunks)
    .where(and(eq(ragChunks.fuenteTipo, params.fuenteTipo), eq(ragChunks.fuenteId, params.fuenteId)))
    .all();
  if (previos.length) {
    borrarVecDeFuente(previos.map((p) => p.id));
    db.delete(ragChunks)
      .where(and(eq(ragChunks.fuenteTipo, params.fuenteTipo), eq(ragChunks.fuenteId, params.fuenteId)))
      .run();
  }

  const textos = params.items.map((i) => i.contenido);
  const embeddings = await embeder(textos);
  const usarVec = Boolean(embeddings) && vecActivo();

  const nowIso = new Date().toISOString();
  const ids = params.items.map(() => uuidv7());

  const insert = sqlite.transaction(() => {
    params.items.forEach((item, idx) => {
      db.insert(ragChunks)
        .values({
          id: ids[idx]!,
          fuenteTipo: params.fuenteTipo,
          fuenteId: params.fuenteId,
          causaId: params.causaId,
          tituloFuente: `${params.tituloFuente}${item.titulo && item.titulo !== 'Fragmento' ? ` · ${item.titulo}` : ''}`,
          contenido: item.contenido,
          embedding: embeddings ? Buffer.from(new Float32Array(embeddings[idx]!).buffer) : null,
          createdAt: nowIso,
        })
        .run();
      if (usarVec && embeddings) {
        upsertVec(ids[idx]!, embeddings[idx]!, params.fuenteTipo, params.causaId);
      }
      params.progreso?.(Math.round(((idx + 1) / params.items.length) * 100));
    });
  });
  insert();

  return { chunks: params.items.length, conEmbeddings: Boolean(embeddings) };
}

export async function ingestarCodigo(params: {
  codigoId: string;
  titulo: string; // 'COGEP', 'Código Civil'…
  texto: string;
}): Promise<IngestaResultado> {
  const items = chunkearCodigo(params.texto);
  logger.info({ titulo: params.titulo, chunks: items.length }, 'ingestando código');
  return guardarChunks({
    fuenteTipo: 'codigo',
    fuenteId: params.codigoId,
    causaId: null,
    tituloFuente: params.titulo,
    items,
  });
}

export async function ingestarArchivoCausa(params: {
  archivoId: string;
  causaId: string;
  nombre: string;
  texto: string;
  userId: string;
}): Promise<IngestaResultado> {
  const items = chunkearArchivo(params.texto).map((c) => ({ titulo: '', contenido: c }));
  const r = await guardarChunks({
    fuenteTipo: 'archivo_causa',
    fuenteId: params.archivoId,
    causaId: params.causaId,
    tituloFuente: params.nombre,
    items,
    progreso: (pct) => emitToUser(params.userId, { t: 'rag:progreso', archivoId: params.archivoId, pct }),
  });
  db.update(archivos)
    .set({ indexadoRag: true, updatedAt: new Date().toISOString() })
    .where(eq(archivos.id, params.archivoId))
    .run();
  emitToUser(params.userId, { t: 'rag:progreso', archivoId: params.archivoId, pct: 100 });
  return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recuperación (PLAN §6.2)
// ─────────────────────────────────────────────────────────────────────────────

export interface Fragmento {
  contenido: string;
  fuente: string;
  fuenteTipo: string;
}

export async function recuperar(
  consulta: string,
  opts: { causaId?: string | null; top?: number } = {},
): Promise<Fragmento[]> {
  const top = opts.top ?? 8;
  const emb = await embederUno(consulta);

  if (emb && vecActivo()) {
    const { buscarVec } = await import('@/lib/ai/vec');
    const hits = buscarVec(emb, top * 2, opts.causaId ?? null).filter(
      (h) => h.distancia <= UMBRAL_DISTANCIA,
    );
    if (hits.length) {
      const ids = hits.slice(0, top).map((h) => h.chunkId);
      const filas = db
        .select()
        .from(ragChunks)
        .where(or(...ids.map((id) => eq(ragChunks.id, id))))
        .all();
      const byId = new Map(filas.map((f) => [f.id, f]));
      return ids
        .map((id) => byId.get(id))
        .filter((f): f is NonNullable<typeof f> => Boolean(f))
        .map((f) => ({ contenido: f.contenido, fuente: f.tituloFuente ?? 'Fuente', fuenteTipo: f.fuenteTipo }));
    }
  }

  // Fallback: búsqueda por palabras clave sobre el contenido.
  const palabras = consulta
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);
  if (palabras.length === 0) return [];
  const filas = db
    .select()
    .from(ragChunks)
    .where(
      and(
        or(...palabras.map((w) => like(ragChunks.contenido, `%${w}%`))),
        opts.causaId
          ? or(eq(ragChunks.fuenteTipo, 'codigo'), eq(ragChunks.causaId, opts.causaId))
          : eq(ragChunks.fuenteTipo, 'codigo'),
      ),
    )
    .limit(top)
    .all();
  return filas.map((f) => ({
    contenido: f.contenido,
    fuente: f.tituloFuente ?? 'Fuente',
    fuenteTipo: f.fuenteTipo,
  }));
}

export function contarChunks(): { codigos: number; archivos: number } {
  const row = db
    .select({
      codigos: sql<number>`sum(case when ${ragChunks.fuenteTipo} = 'codigo' then 1 else 0 end)`,
      archivos: sql<number>`sum(case when ${ragChunks.fuenteTipo} = 'archivo_causa' then 1 else 0 end)`,
    })
    .from(ragChunks)
    .get();
  return { codigos: Number(row?.codigos ?? 0), archivos: Number(row?.archivos ?? 0) };
}
