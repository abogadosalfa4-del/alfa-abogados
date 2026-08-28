import { handleErrors, errores, requireSession } from '@/lib/http';
import { obtenerDocumento, obtenerSnapshot } from '@/lib/documentos';
import { jsonADocx } from '@/lib/editor/docx';

type Ctx = { params: Promise<{ id: string }> };

/** PLAN §8.2: exporta el snapshot Tiptap del documento a .docx. */
export function GET(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    await requireSession();
    const { id } = await ctx.params;
    const doc = obtenerDocumento(id);
    if (!doc) throw errores.noEncontrado('documento');

    const snapshot = obtenerSnapshot(id);
    const buffer = await jsonADocx(snapshot, doc.titulo);

    const nombre = doc.titulo.replace(/[^\p{L}\p{N}\s-]/gu, '').trim() || 'documento';
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${nombre}.docx"`,
      },
    });
  });
}
