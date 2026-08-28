import { z } from 'zod';
import { errores, handleErrors, ok, parseBody, requireSession } from '@/lib/http';
import {
  eliminarConversacion,
  mensajesDe,
  obtenerConversacion,
  renombrarConversacion,
} from '@/lib/ai/conversaciones';

type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const { userId } = await requireSession();
    const { id } = await ctx.params;
    const conv = obtenerConversacion(id, userId);
    if (!conv) throw errores.noEncontrado('conversación');
    return ok({
      conversacion: { id: conv.id, titulo: conv.titulo, causaId: conv.causaId },
      mensajes: mensajesDe(id),
    });
  });
}

export function PATCH(req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const { userId } = await requireSession();
    const { id } = await ctx.params;
    const { titulo } = await parseBody(req, z.object({ titulo: z.string().trim().min(1).max(120) }));
    renombrarConversacion(id, userId, titulo);
    return ok({ ok: true });
  });
}

export function DELETE(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const { userId } = await requireSession();
    const { id } = await ctx.params;
    eliminarConversacion(id, userId);
    return ok({ ok: true });
  });
}
