import { handleErrors, ok, requireSession } from '@/lib/http';
import {
  listarNotificaciones,
  marcarTodasLeidas,
} from '@/lib/notificaciones';

export function GET() {
  return handleErrors(async () => {
    const { userId } = await requireSession();
    return ok({ notificaciones: listarNotificaciones(userId) });
  });
}

export function POST() {
  return handleErrors(async () => {
    const { userId } = await requireSession();
    marcarTodasLeidas(userId);
    return ok({ ok: true });
  });
}
