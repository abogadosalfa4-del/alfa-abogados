import { errores, handleErrors, ok, requireRole } from '@/lib/http';
import { queue } from '@/lib/queue';
import { leerArchivo } from '@/lib/archivos';
import { extraerTexto } from '@/lib/ai/extraer-texto';
import { ingestarArchivoCausa } from '@/lib/ai/rag';
import { log } from '@/lib/logger';

const logger = log('rag');

type Ctx = { params: Promise<{ id: string }> };

/** PLAN §5.1: "Usar en IA" — encola la ingestión RAG del archivo del expediente. */
export function POST(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario', 'asistente');
    const { id } = await ctx.params;
    const r = await leerArchivo(id);
    if (!r) throw errores.noEncontrado('archivo');

    void queue.add(async () => {
      try {
        const texto = await extraerTexto(r.buffer, r.archivo.mime);
        if (!texto.trim()) {
          logger.warn({ id }, 'archivo sin texto extraíble');
          return;
        }
        await ingestarArchivoCausa({
          archivoId: id,
          causaId: r.archivo.causaId,
          nombre: r.archivo.nombreOriginal,
          texto,
          userId: actor.userId,
        });
      } catch (err) {
        logger.error({ err, id }, 'fallo al indexar archivo');
      }
    });

    return ok({ encolado: true }, { status: 202 });
  });
}
