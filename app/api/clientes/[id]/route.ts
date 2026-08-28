import { errores, handleErrors, ok, requireSession } from '@/lib/http';
import { expedienteCliente } from '@/lib/clientes';

type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    await requireSession();
    const { id } = await ctx.params;
    const exp = expedienteCliente(id);
    if (!exp) throw errores.noEncontrado('cliente');
    return ok(exp);
  });
}
