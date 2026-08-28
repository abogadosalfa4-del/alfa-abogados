import { handleErrors, ok, requireSession } from '@/lib/http';
import { listarPorCliente } from '@/lib/clientes';

export function GET(req: Request) {
  return handleErrors(async () => {
    await requireSession();
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
    return ok(listarPorCliente(q));
  });
}
