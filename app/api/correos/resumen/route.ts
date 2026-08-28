import { handleErrors, ok, requireRole } from '@/lib/http';
import { generarResumen } from '@/lib/outlook/resumen';

export function GET(req: Request) {
  return handleErrors(async () => {
    const { userId } = await requireRole('admin', 'abogado', 'secretario');
    const forzar = new URL(req.url).searchParams.get('forzar') === '1';
    return ok({ resumen: await generarResumen(userId, { forzar }) });
  });
}
