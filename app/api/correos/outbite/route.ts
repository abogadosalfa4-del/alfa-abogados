import { z } from 'zod';
import { errores, handleErrors, ok, parseBody, requireRole } from '@/lib/http';
import {
  estadoOutbite,
  guardarOutbite,
  probarOutbite,
} from '@/lib/outlook/outbite';

export function GET() {
  return handleErrors(async () => {
    await requireRole('admin', 'abogado', 'secretario');
    return ok(estadoOutbite());
  });
}

const schema = z.object({
  workerUrl: z.string().trim().url(),
  secret: z.string().trim().min(8),
});

export function POST(req: Request) {
  return handleErrors(async () => {
    await requireRole('admin');
    const { workerUrl, secret } = await parseBody(req, schema);
    try {
      await probarOutbite(workerUrl, secret);
    } catch (err) {
      throw errores.validacion(err instanceof Error ? err.message : 'No se pudo conectar.');
    }
    guardarOutbite({ workerUrl, secret });
    return ok(estadoOutbite());
  });
}
