import { handleErrors, ok, parseBody, requireRole } from '@/lib/http';
import { buscarSadjeSchema } from '@/lib/schemas/causa';
import { encolarBusquedaSadje } from '@/lib/sadje/jobs';

/** PLAN §5.2: encola la consulta a e-SATJE y responde 202 con el jobId. */
export function POST(req: Request) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const params = await parseBody(req, buscarSadjeSchema);
    const jobId = encolarBusquedaSadje(params, actor);
    return ok({ jobId }, { status: 202 });
  });
}
