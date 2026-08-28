import { z } from 'zod';
import { handleErrors, ok, parseBody, requireRole } from '@/lib/http';
import { encolarImportacion } from '@/lib/sadje/jobs';

const schema = z.object({
  resumen: z.object({
    idJuicio: z.string().min(1),
    numeroJuicio: z.string().min(1),
    estado: z.string().default(''),
    materia: z.string().default(''),
    tipoAccion: z.string().default(''),
    judicatura: z.string().default(''),
    fechaIngreso: z.string().default(''),
  }),
  clienteId: z.string().uuid().optional().nullable(),
});

/** PLAN §5.1: importa una causa desde un resultado de búsqueda SADJE. */
export function POST(req: Request) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const { resumen, clienteId } = await parseBody(req, schema);
    const jobId = encolarImportacion(resumen, clienteId ?? null, actor);
    return ok({ jobId }, { status: 202 });
  });
}
