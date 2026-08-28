import { handleErrors, errores, requireRole } from '@/lib/http';
import { eliminarArchivo, leerArchivo } from '@/lib/archivos';

type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    await requireRole('admin', 'abogado', 'secretario', 'asistente');
    const { id } = await ctx.params;
    const r = await leerArchivo(id);
    if (!r) throw errores.noEncontrado('archivo');
    return new Response(new Uint8Array(r.buffer), {
      headers: {
        'Content-Type': r.archivo.mime,
        'Content-Disposition': `inline; filename="${encodeURIComponent(r.archivo.nombreOriginal)}"`,
      },
    });
  });
}

export function DELETE(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const { id } = await ctx.params;
    await eliminarArchivo(id, actor);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
}
