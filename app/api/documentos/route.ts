import { z } from 'zod';
import {
  handleErrors,
  ok,
  parseBody,
  requireRole,
  requireSession,
} from '@/lib/http';
import { crearDocumento, listarDocumentos } from '@/lib/documentos';

const crearSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  causaId: z.string().uuid().optional().nullable(),
});

export function GET() {
  return handleErrors(async () => {
    await requireSession();
    return ok({ documentos: listarDocumentos() });
  });
}

export function POST(req: Request) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario', 'asistente');
    const input = await parseBody(req, crearSchema);
    return ok({ documento: crearDocumento(input, actor) }, { status: 201 });
  });
}
