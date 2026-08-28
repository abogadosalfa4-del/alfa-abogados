import { z } from 'zod';
import {
  errores,
  handleErrors,
  ok,
  parseBody,
  requireSession,
} from '@/lib/http';
import {
  obtenerDocumento,
  obtenerDocumentoDTO,
  puedeEditarDocumento,
} from '@/lib/documentos';
import { sugerirTextoDocumento } from '@/lib/ai/sugerir-documento';

export const maxDuration = 90;

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  instruccion: z.string().trim().min(2).max(2000),
  textoDocumento: z.string().max(50000),
  textoSeleccion: z.string().max(10000).optional(),
});

export function POST(req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireSession();
    const { id } = await ctx.params;
    const doc = obtenerDocumento(id);
    const dto = obtenerDocumentoDTO(id);
    if (!doc || !dto) throw errores.noEncontrado('documento');
    if (!puedeEditarDocumento(doc, actor)) throw errores.sinPermiso();

    const body = await parseBody(req, bodySchema);

    const resultado = await sugerirTextoDocumento({
      instruccion: body.instruccion,
      tituloDocumento: dto.titulo,
      textoDocumento: body.textoDocumento,
      textoSeleccion: body.textoSeleccion,
      causaId: dto.causaId,
      actor: {
        userId: actor.userId,
        role: actor.role,
        userName: actor.session.user.name,
      },
    });

    return ok(resultado);
  });
}
