import { handleErrors, ok, requireSession } from '@/lib/http';
import { proximosEventos } from '@/lib/eventos';

export function GET() {
  return handleErrors(async () => {
    await requireSession();
    return ok({ eventos: proximosEventos(7) });
  });
}
