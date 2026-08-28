import { errores, handleErrors, ok, requireRole, requireSession } from '@/lib/http';
import { contarChunks } from '@/lib/ai/rag';
import { encolarIngestaCodigo, listarCodigos } from '@/lib/ai/codigos';

export function GET() {
  return handleErrors(async () => {
    await requireSession();
    return ok({ codigos: listarCodigos(), totales: contarChunks() });
  });
}

export function POST(req: Request) {
  return handleErrors(async () => {
    await requireRole('admin');
    const form = await req.formData();
    const file = form.get('file');
    const titulo = String(form.get('titulo') ?? '').trim();
    if (!(file instanceof File)) throw errores.validacion('Falta el PDF.');
    if (!titulo) throw errores.validacion('Indicá el nombre del código (ej. COGEP).');
    if (file.type && file.type !== 'application/pdf') {
      throw errores.validacion('El archivo debe ser un PDF.');
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const fuenteId = encolarIngestaCodigo(titulo, buffer);
    return ok({ fuenteId }, { status: 202 });
  });
}
