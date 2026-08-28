import {
  handleErrors,
  ok,
  parseBody,
  parseQuery,
  requireRole,
  requireSession,
  withIdempotency,
} from '@/lib/http';
import { eventoCreateSchema, eventoRangoSchema } from '@/lib/schemas/evento';
import { crearEvento, listarEventos } from '@/lib/eventos';

export function GET(req: Request) {
  return handleErrors(async () => {
    await requireSession();
    const { desde, hasta } = parseQuery(req.url, eventoRangoSchema);
    return ok({ eventos: listarEventos(desde, hasta) });
  });
}

export function POST(req: Request) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const input = await parseBody(req, eventoCreateSchema);
    const { data, replayed } = await withIdempotency(req, async () =>
      crearEvento(input, actor),
    );
    return ok({ evento: data }, { status: replayed ? 200 : 201 });
  });
}
