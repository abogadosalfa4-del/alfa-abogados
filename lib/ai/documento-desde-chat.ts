import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { db } from '@/lib/db';
import { documentoYjs } from '@/lib/db/schema';
import { crearDocumento } from '@/lib/documentos';
import { markdownATiptap } from '@/lib/ai/tiptap';

interface Actor {
  userId: string;
  role: string;
}

/**
 * "Abrir en editor" (PLAN §6.1): crea un documento y lo pre-carga con el
 * contenido de la respuesta del chat (markdown → Tiptap → estado Yjs inicial).
 */
export function crearDocumentoDesdeChat(
  params: { titulo: string; markdown: string; causaId?: string | null },
  actor: Actor,
): { id: string } {
  const doc = crearDocumento({ titulo: params.titulo, causaId: params.causaId ?? null }, actor);

  const pm = markdownATiptap(params.markdown);
  const ydoc = TiptapTransformer.toYdoc(pm, 'default');
  const binario = Buffer.from(Y.encodeStateAsUpdate(ydoc));

  const nowIso = new Date().toISOString();
  db.insert(documentoYjs)
    .values({ documentoId: doc.id, estadoBinario: binario, snapshotJson: JSON.stringify(pm), updatedAt: nowIso })
    .onConflictDoUpdate({
      target: documentoYjs.documentoId,
      set: { estadoBinario: binario, snapshotJson: JSON.stringify(pm), updatedAt: nowIso },
    })
    .run();

  return { id: doc.id };
}
