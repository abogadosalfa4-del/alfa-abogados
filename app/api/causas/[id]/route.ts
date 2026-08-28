import {
  errores,
  handleErrors,
  ok,
  parseBody,
  requireRole,
} from '@/lib/http';
import { actualizarCausa, eliminarCausa, expediente } from '@/lib/causas';
import { causaUpdateSchema } from '@/lib/schemas/causa';

type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    await requireRole('admin', 'abogado', 'secretario', 'asistente');
    const { id } = await ctx.params;
    const exp = expediente(id);
    if (!exp) throw errores.noEncontrado('causa');
    return ok(exp);
  });
}

export function PATCH(req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const { id } = await ctx.params;
    const patch = await parseBody(req, causaUpdateSchema);
    return ok({ causa: actualizarCausa(id, patch, actor) });
  });
}

export function DELETE(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const { id } = await ctx.params;
    eliminarCausa(id, actor);
    return ok({ ok: true });
  });
}
