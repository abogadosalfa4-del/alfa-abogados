import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { uuidv7 } from 'uuidv7';
import { errores, handleErrors, ok, requireRole } from '@/lib/http';
import { parseEml, parseMsg, type CorreoParseado } from '@/lib/outlook/parsers';
import { clasificarCorreo } from '@/lib/outlook/clasificador';

const STORAGE = resolve(process.cwd(), 'storage', 'correos');

/**
 * PLAN §4.4: drop de un `.msg`/`.eml` (o texto plano) sobre una celda del
 * calendario. Devuelve un evento BORRADOR pre-clasificado; el cliente abre el
 * diálogo pre-llenado y NUNCA se guarda sin confirmación humana.
 */
export function POST(req: Request) {
  return handleErrors(async () => {
    await requireRole('admin', 'abogado', 'secretario');
    const form = await req.formData();
    const fecha = String(form.get('fecha') ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw errores.validacion('Falta la fecha de la celda.');
    }

    const file = form.get('file');
    const textoPlano = String(form.get('text') ?? '').trim();

    let correo: CorreoParseado;

    if (file instanceof File) {
      const nombre = file.name.toLowerCase();
      const ext = extname(nombre);
      const buffer = Buffer.from(await file.arrayBuffer());
      if (ext === '.msg') {
        correo = parseMsg(buffer);
      } else if (ext === '.eml') {
        correo = await parseEml(buffer);
      } else {
        throw errores.validacion('Solo se aceptan archivos .msg o .eml.');
      }
      mkdirSync(STORAGE, { recursive: true });
      writeFileSync(join(STORAGE, `${uuidv7()}${ext}`), buffer);
    } else if (textoPlano) {
      // Drag directo desde Outlook clásico: solo texto plano (§4.4.7).
      const [primeraLinea, ...resto] = textoPlano.split('\n');
      correo = {
        subject: primeraLinea?.slice(0, 200) ?? 'Correo',
        from: '',
        receivedAt: null,
        bodyText: resto.join('\n') || textoPlano,
      };
    } else {
      throw errores.validacion('No se recibió ningún correo.');
    }

    const borrador = clasificarCorreo(correo, fecha);
    return ok({ borrador });
  });
}
