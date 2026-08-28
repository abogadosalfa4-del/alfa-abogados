import { z } from 'zod';
import { handleErrors, ok, parseBody, requireRole } from '@/lib/http';
import { crearDocumentoDesdeChat } from '@/lib/ai/documento-desde-chat';

const schema = z.object({
  titulo: z.string().trim().min(1).max(200),
  markdown: z.string().min(1).max(60_000),
  causaId: z.string().uuid().optional().nullable(),
});

/** PLAN §6.1: "Abrir en editor" — crea un documento con la respuesta del chat. */
export function POST(req: Request) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario', 'asistente');
    const input = await parseBody(req, schema);
    return ok({ documento: crearDocumentoDesdeChat(input, actor) }, { status: 201 });
  });
}
