import { createGoogleGenerativeAI } from '@ai-sdk/google';
import 'server-only';
import { env } from '@/lib/env';

/**
 * Google Gemini vía AI SDK. Chat: gemini-3.5-flash-lite (rápido y barato);
 * embeddings: gemini-embedding-001.
 * En la PC de oficina se define `GEMINI_API_KEY` en `.env`.
 */
export const IA_DISPONIBLE = Boolean(env.GEMINI_API_KEY);

const google = createGoogleGenerativeAI({
  apiKey: env.GEMINI_API_KEY ?? '',
});

export const MODELO_CHAT = 'gemini-3.5-flash-lite';
export const MODELO_EMBEDDINGS = 'gemini-embedding-001';
export const EMBED_DIM = 1536;

export function modeloChat() {
  return google(MODELO_CHAT);
}

export function modeloEmbeddings() {
  return google.embeddingModel(MODELO_EMBEDDINGS);
}

export const EMBEDDING_PROVIDER_OPTIONS = {
  google: {
    outputDimensionality: EMBED_DIM,
    taskType: 'RETRIEVAL_DOCUMENT' as const,
  },
};

export const EMBEDDING_QUERY_OPTIONS = {
  google: {
    outputDimensionality: EMBED_DIM,
    taskType: 'RETRIEVAL_QUERY' as const,
  },
};
