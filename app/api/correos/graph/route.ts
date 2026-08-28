import { errores, handleErrors, ok, requireRole } from '@/lib/http';
import {
  desconectar,
  estadoConexion,
  graphConfigurado,
  iniciarDeviceCode,
} from '@/lib/outlook/graph';

export function GET() {
  return handleErrors(async () => {
    const { userId } = await requireRole('admin', 'abogado', 'secretario');
    return ok(estadoConexion(userId));
  });
}

export function POST() {
  return handleErrors(async () => {
    const { userId } = await requireRole('admin', 'abogado', 'secretario');
    if (!graphConfigurado()) {
      throw errores.validacion('Microsoft Graph no está configurado en el servidor.');
    }
    const codigo = await iniciarDeviceCode(userId);
    return ok({ deviceCode: codigo });
  });
}

export function DELETE() {
  return handleErrors(async () => {
    const { userId } = await requireRole('admin', 'abogado', 'secretario');
    desconectar(userId);
    return ok({ ok: true });
  });
}
