import { errores, handleErrors, ok, requireRole } from '@/lib/http';
import { abrirCorreoCasillero } from '@/lib/outlook/casillero';

type Ctx = { params: Promise<{ id: string }> };

/** Abre el correo y lo marca como leído. */
export function GET(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    await requireRole('admin', 'abogado', 'secretario');
    const { id } = await ctx.params;
    const correo = abrirCorreoCasillero(id);
    if (!correo) throw errores.noEncontrado('correo');
    return ok({ correo });
  });
}
