import {
  handleErrors,
  ok,
  parseBody,
  requireRole,
  requireSession,
  withIdempotency,
} from '@/lib/http';
import { tareaCreateSchema } from '@/lib/schemas/tarea';
import { crearTarea, listarTareasVivas } from '@/lib/tareas';

export function GET() {
  return handleErrors(async () => {
    await requireSession();
    return ok({ tareas: listarTareasVivas() });
  });
}

export function POST(req: Request) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const input = await parseBody(req, tareaCreateSchema);
    const { data, replayed } = await withIdempotency(req, async () =>
      crearTarea(input, actor),
    );
    return ok({ tarea: data }, { status: replayed ? 200 : 201 });
  });
}
