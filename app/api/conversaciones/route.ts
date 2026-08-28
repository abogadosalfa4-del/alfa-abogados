import { z } from 'zod';
import { handleErrors, ok, parseBody, requireSession } from '@/lib/http';
import {
  crearConversacion,
  listarConversaciones,
} from '@/lib/ai/conversaciones';

export function GET() {
  return handleErrors(async () => {
    const { userId } = await requireSession();
    return ok({ conversaciones: listarConversaciones(userId) });
  });
}

const crearSchema = z.object({
  titulo: z.string().trim().max(120).optional(),
  causaId: z.string().uuid().optional().nullable(),
});

export function POST(req: Request) {
  return handleErrors(async () => {
    const { userId } = await requireSession();
    const input = await parseBody(req, crearSchema);
    return ok({ conversacion: crearConversacion(userId, input) }, { status: 201 });
  });
}
