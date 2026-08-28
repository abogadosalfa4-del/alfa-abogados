import { z } from 'zod';
import {
  errores,
  handleErrors,
  ok,
  parseBody,
  requireSession,
} from '@/lib/http';
import {
  aprobarDocumento,
  devolverABorrador,
  enviarARevision,
  obtenerDocumentoDTO,
  renombrarDocumento,
} from '@/lib/documentos';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.union([
  z.object({ titulo: z.string().trim().min(1).max(200) }),
  z.object({ accion: z.enum(['enviar', 'aprobar', 'devolver']) }),
]);

export function GET(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    await requireSession();
    const { id } = await ctx.params;
    const documento = obtenerDocumentoDTO(id);
    if (!documento) throw errores.noEncontrado('documento');
    return ok({ documento });
  });
}

export function PATCH(req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireSession();
    const { id } = await ctx.params;
    const body = await parseBody(req, patchSchema);

    if ('titulo' in body) {
      return ok({ documento: renombrarDocumento(id, body.titulo, actor) });
    }
    switch (body.accion) {
      case 'enviar':
        return ok({ documento: enviarARevision(id, actor) });
      case 'aprobar':
        return ok({ documento: aprobarDocumento(id, actor) });
      case 'devolver':
        return ok({ documento: devolverABorrador(id, actor) });
    }
  });
}
