import {
  handleErrors,
  ok,
  parseBody,
  requireRole,
  requireSession,
} from '@/lib/http';
import { listarPorCliente } from '@/lib/clientes';
import { crearCausaManual } from '@/lib/causas';
import { causaManualSchema } from '@/lib/schemas/causa';

export function GET(req: Request) {
  return handleErrors(async () => {
    await requireSession();
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
    return ok(listarPorCliente(q));
  });
}

export function POST(req: Request) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const input = await parseBody(req, causaManualSchema);
    return ok({ causa: crearCausaManual(input, actor) }, { status: 201 });
  });
}
