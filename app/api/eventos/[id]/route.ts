import {
  errores,
  handleErrors,
  ok,
  parseBody,
  requireRole,
} from '@/lib/http';
import { eventoUpdateSchema } from '@/lib/schemas/evento';
import { actualizarEvento, eliminarEvento, obtenerEvento } from '@/lib/eventos';

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const { id } = await ctx.params;
    const patch = await parseBody(req, eventoUpdateSchema);
    return ok({ evento: actualizarEvento(id, patch, actor) });
  });
}

export function DELETE(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const { id } = await ctx.params;
    if (!obtenerEvento(id)) throw errores.noEncontrado('evento');
    eliminarEvento(id, actor);
    return ok({ ok: true });
  });
}
