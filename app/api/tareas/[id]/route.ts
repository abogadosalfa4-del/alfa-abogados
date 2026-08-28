import {
  errores,
  handleErrors,
  ok,
  parseBody,
  requireRole,
  requireSession,
} from '@/lib/http';
import {
  tareaMoverSchema,
  tareaUpdateSchema,
} from '@/lib/schemas/tarea';
import {
  actualizarTarea,
  eliminarTarea,
  moverTarea,
  obtenerTareaDTO,
} from '@/lib/tareas';

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireSession();
    const { id } = await ctx.params;
    const body = (await req.clone().json().catch(() => ({}))) as Record<string, unknown>;

    // Movimiento en el tablero: cualquier rol (PLAN §3).
    if ('columna' in body && 'orden' in body && Object.keys(body).length === 2) {
      const mov = await parseBody(req, tareaMoverSchema);
      const { tarea, documentoCreadoId } = moverTarea(id, mov, actor);
      return ok({ tarea, documentoCreadoId });
    }

    // Edición de contenido: la valida `actualizarTarea` según rol/propiedad.
    const patch = await parseBody(req, tareaUpdateSchema);
    return ok({ tarea: actualizarTarea(id, patch, actor) });
  });
}

export function DELETE(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const { id } = await ctx.params;
    if (!obtenerTareaDTO(id)) throw errores.noEncontrado('tarea');
    eliminarTarea(id, actor);
    return ok({ ok: true });
  });
}
