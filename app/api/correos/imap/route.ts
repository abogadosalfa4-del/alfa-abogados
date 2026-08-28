import { z } from 'zod';
import { errores, handleErrors, ok, parseBody, requireRole } from '@/lib/http';
import {
  borrarImap,
  estadoImap,
  guardarImap,
  probarImap,
} from '@/lib/outlook/imap';

export function GET() {
  return handleErrors(async () => {
    await requireRole('admin', 'abogado', 'secretario');
    return ok(estadoImap());
  });
}

const schema = z.object({
  usuario: z.string().trim().email('Ingresá el Gmail completo.'),
  password: z.string().min(8, 'Pegá la contraseña de aplicación de 16 letras.'),
});

export function POST(req: Request) {
  return handleErrors(async () => {
    const { userId } = await requireRole('admin');
    const { usuario, password } = await parseBody(req, schema);
    try {
      await probarImap(usuario, password);
    } catch (err) {
      throw errores.validacion(err instanceof Error ? err.message : 'No se pudo conectar a Gmail.');
    }
    return ok(guardarImap({ usuario, password, configuradoPor: userId }));
  });
}

export function DELETE() {
  return handleErrors(async () => {
    await requireRole('admin');
    borrarImap();
    return ok({ conectado: false });
  });
}
