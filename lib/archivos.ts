import { mkdirSync, createWriteStream, existsSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '@/lib/db';
import { archivos, causas, type Archivo } from '@/lib/db/schema';
import { audit } from '@/lib/audit';
import { errores } from '@/lib/errores';

const STORAGE = resolve(process.cwd(), 'storage');
const MAX_BYTES = 25 * 1024 * 1024;

const MIME_OK = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

interface Actor {
  userId: string;
  role: string;
}

export function listarArchivos(causaId: string): Archivo[] {
  return db
    .select()
    .from(archivos)
    .where(and(eq(archivos.causaId, causaId), isNull(archivos.deletedAt)))
    .orderBy(desc(archivos.createdAt))
    .all();
}

export async function subirArchivo(
  causaId: string,
  file: File,
  actor: Actor,
): Promise<Archivo> {
  const causa = db.select({ id: causas.id }).from(causas).where(eq(causas.id, causaId)).get();
  if (!causa) throw errores.noEncontrado('causa');

  if (file.size > MAX_BYTES) {
    throw errores.validacion(`El archivo supera el límite de ${MAX_BYTES / 1024 / 1024} MB.`);
  }
  const mime = file.type || 'application/octet-stream';
  if (!MIME_OK.has(mime)) {
    throw errores.validacion(`Tipo de archivo no permitido (${mime}).`);
  }

  const dir = join(STORAGE, 'causas', causaId);
  mkdirSync(dir, { recursive: true });
  const id = uuidv7();
  const nombreOriginal = file.name.replace(/[/\\]/g, '_').slice(0, 200);
  const ext = extname(nombreOriginal) || '';
  const rutaAbs = join(dir, `${id}${ext}`);
  const rutaRelativa = join('causas', causaId, `${id}${ext}`);

  const buf = Buffer.from(await file.arrayBuffer());
  await new Promise<void>((res, rej) => {
    const ws = createWriteStream(rutaAbs);
    ws.on('error', rej);
    ws.on('finish', () => res());
    ws.end(buf);
  });

  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    tx.insert(archivos)
      .values({
        id,
        causaId,
        nombreOriginal,
        rutaRelativa,
        mime,
        tamano: file.size,
        subidoPor: actor.userId,
        indexadoRag: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();
    audit(
      { userId: actor.userId, entidad: 'archivo', entidadId: id, accion: 'create', diff: { causaId, nombreOriginal } },
      tx,
    );
  });

  return db.select().from(archivos).where(eq(archivos.id, id)).get()!;
}

export async function leerArchivo(id: string): Promise<{ archivo: Archivo; buffer: Buffer } | null> {
  const archivo = db
    .select()
    .from(archivos)
    .where(and(eq(archivos.id, id), isNull(archivos.deletedAt)))
    .get();
  if (!archivo) return null;
  const abs = resolve(STORAGE, archivo.rutaRelativa);
  if (!abs.startsWith(STORAGE) || !existsSync(abs)) return null;
  return { archivo, buffer: await readFile(abs) };
}

export async function eliminarArchivo(id: string, actor: Actor): Promise<void> {
  const archivo = db.select().from(archivos).where(eq(archivos.id, id)).get();
  if (!archivo || archivo.deletedAt) throw errores.noEncontrado('archivo');
  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(archivos).set({ deletedAt: nowIso, updatedAt: nowIso }).where(eq(archivos.id, id)).run();
    audit({ userId: actor.userId, entidad: 'archivo', entidadId: id, accion: 'delete' }, tx);
  });
  // El archivo físico se conserva (PLAN §16: nunca se borra data); si se quisiera
  // liberar espacio: await unlink(resolve(STORAGE, archivo.rutaRelativa)).
  void unlink;
}
