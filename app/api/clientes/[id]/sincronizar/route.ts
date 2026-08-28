import { handleErrors, ok, requireRole } from '@/lib/http';
import { encolarSincronizacionCliente } from '@/lib/sadje/jobs';

type Ctx = { params: Promise<{ id: string }> };

export function POST(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const { id } = await ctx.params;
    const jobIds = encolarSincronizacionCliente(id, actor);
    return ok({ jobIds }, { status: 202 });
  });
}
