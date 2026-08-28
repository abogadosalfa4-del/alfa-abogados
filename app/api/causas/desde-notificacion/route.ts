import { z } from 'zod';
import { handleErrors, ok, parseBody, requireRole } from '@/lib/http';
import { ingestarNotificacionCasillero } from '@/lib/causas';

const schema = z.object({
  texto: z.string().trim().min(40).max(30_000),
});

/** Crea o actualiza una causa pegando el correo del casillero electrónico. */
export function POST(req: Request) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const { texto } = await parseBody(req, schema);
    const { causa, creada } = ingestarNotificacionCasillero(texto, actor);
    return ok({ causa, creada }, { status: creada ? 201 : 200 });
  });
}
