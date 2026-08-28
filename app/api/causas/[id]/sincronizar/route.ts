import { handleErrors, ok, requireRole } from '@/lib/http';
import { encolarSincronizacion } from '@/lib/sadje/jobs';

type Ctx = { params: Promise<{ id: string }> };

/** PLAN §5.2: "Sincronizar ahora" ignora la caché. Responde 202. */
export function POST(req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const { id } = await ctx.params;
    const ignorarCache =
      new URL(req.url).searchParams.get('forzar') === '1';
    const jobId = encolarSincronizacion(id, actor, { ignorarCache });
    return ok({ jobId }, { status: 202 });
  });
}
