import { handleErrors, ok, errores, requireRole } from '@/lib/http';
import { listarArchivos, subirArchivo } from '@/lib/archivos';

type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    await requireRole('admin', 'abogado', 'secretario', 'asistente');
    const { id } = await ctx.params;
    return ok({ archivos: listarArchivos(id) });
  });
}

export function POST(req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    // Subir archivos al expediente: todos los roles (PLAN §3).
    const actor = await requireRole('admin', 'abogado', 'secretario', 'asistente');
    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw errores.validacion('Falta el archivo.');
    return ok({ archivo: await subirArchivo(id, file, actor) }, { status: 201 });
  });
}
