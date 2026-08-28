import { handleErrors, ok, requireRole } from '@/lib/http';
import { estadoConexion } from '@/lib/outlook/graph';
import { estadoImap } from '@/lib/outlook/imap';
import { estadoOutbite } from '@/lib/outlook/outbite';
import {
  ingestarCasilleroDesdeBuzon,
  listarCorreosCasillero,
} from '@/lib/outlook/casillero';
import { errores } from '@/lib/errores';

/** Bandeja local: sobrevive si el servidor se apagó; lo pendiente llega al arranque. */
export function GET() {
  return handleErrors(async () => {
    await requireRole('admin', 'abogado', 'secretario');
    return ok(listarCorreosCasillero());
  });
}

/** Importa notificaciones: outbite.app, Gmail IMAP o Outlook Graph. */
export function POST() {
  return handleErrors(async () => {
    const { userId } = await requireRole('admin', 'abogado', 'secretario');
    if (
      !estadoOutbite().configurado &&
      !estadoImap().conectado &&
      !estadoConexion(userId).conectado
    ) {
      throw errores.validacion('Configurá casillero@outbite.app primero.');
    }
    const resultado = await ingestarCasilleroDesdeBuzon(userId);
    return ok({ resultado });
  });
}
