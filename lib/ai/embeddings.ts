import { embedMany } from 'ai';
import {
  IA_DISPONIBLE,
  EMBEDDING_PROVIDER_OPTIONS,
  EMBEDDING_QUERY_OPTIONS,
  modeloEmbeddings,
} from '@/lib/ai/gemini';

/**
 * Embeddings vía Gemini. Batch de 64. Si la IA no está configurada, devuelve null
 * y la ingestión guarda solo el texto.
 */
export async function embeder(textos: string[]): Promise<number[][] | null> {
  if (!IA_DISPONIBLE || textos.length === 0) return null;
  const modelo = modeloEmbeddings();
  const out: number[][] = [];
  for (let i = 0; i < textos.length; i += 64) {
    const lote = textos.slice(i, i + 64);
    const { embeddings } = await embedMany({
      model: modelo,
      values: lote,
      providerOptions: EMBEDDING_PROVIDER_OPTIONS,
    });
    out.push(...embeddings);
  }
  return out;
}

export async function embederUno(texto: string): Promise<number[] | null> {
  if (!IA_DISPONIBLE || !texto.trim()) return null;
  const { embeddings } = await embedMany({
    model: modeloEmbeddings(),
    values: [texto],
    providerOptions: EMBEDDING_QUERY_OPTIONS,
  });
  return embeddings[0] ?? null;
}
