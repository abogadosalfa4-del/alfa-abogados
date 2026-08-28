import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { extractText, getDocumentProxy } from 'unpdf';
import { db } from '@/lib/db';
import { ragChunks } from '@/lib/db/schema';
import { queue } from '@/lib/queue';
import { log } from '@/lib/logger';
import { ingestarCodigo } from '@/lib/ai/rag';
import { emitToAll } from '@/lib/realtime/socket-server';

const logger = log('codigos');
const DIR = resolve(process.cwd(), 'storage', 'codigos');

export interface CodigoInfo {
  fuenteId: string;
  titulo: string;
  chunks: number;
}

export function listarCodigos(): CodigoInfo[] {
  const rows = db
    .select({
      fuenteId: ragChunks.fuenteId,
      titulo: sql<string>`min(${ragChunks.tituloFuente})`,
      chunks: sql<number>`count(*)`,
    })
    .from(ragChunks)
    .where(sql`${ragChunks.fuenteTipo} = 'codigo'`)
    .groupBy(ragChunks.fuenteId)
    .all();
  return rows.map((r) => ({
    fuenteId: r.fuenteId,
    titulo: (r.titulo ?? '').split(' · ')[0] || 'Código',
    chunks: Number(r.chunks),
  }));
}

function slug(titulo: string): string {
  return titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

/** Encola la ingestión de un PDF de código legal (PLAN §6.3). */
export function encolarIngestaCodigo(titulo: string, buffer: Buffer): string {
  const fuenteId = slug(titulo) || `codigo-${Date.now()}`;
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${fuenteId}.pdf`), buffer);

  void queue.add(async () => {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      const r = await ingestarCodigo({ codigoId: fuenteId, titulo, texto: text });
      logger.info({ titulo, ...r }, 'código ingerido');
      emitToAll({
        t: 'notificacion',
        nivel: 'info',
        mensaje: `Código «${titulo}» ingerido: ${r.chunks} fragmentos${r.conEmbeddings ? '' : ' (sin embeddings — falta API key)'}`,
      });
    } catch (err) {
      logger.error({ err, titulo }, 'fallo al ingerir código');
      emitToAll({ t: 'notificacion', nivel: 'warn', mensaje: `No se pudo ingerir «${titulo}».` });
    }
  });

  return fuenteId;
}
