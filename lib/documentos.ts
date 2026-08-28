import { and, desc, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '@/lib/db';
import {
  causas,
  documentos,
  documentoYjs,
  user,
  type Documento,
} from '@/lib/db/schema';
import { audit } from '@/lib/audit';
import { errores } from '@/lib/errores';
import { crearNotificacion } from '@/lib/notificaciones';
import { emitToAll } from '@/lib/realtime/socket-server';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DocumentoDTO = Documento & {
  causaNumero: string | null;
  creadorNombre: string | null;
};

const selectDTO = {
  id: documentos.id,
  titulo: documentos.titulo,
  tareaId: documentos.tareaId,
  causaId: documentos.causaId,
  estado: documentos.estado,
  creadoPor: documentos.creadoPor,
  createdAt: documentos.createdAt,
  updatedAt: documentos.updatedAt,
  deletedAt: documentos.deletedAt,
  causaNumero: causas.numeroJuicio,
  creadorNombre: user.name,
} as const;

function baseQuery() {
  return db
    .select(selectDTO)
    .from(documentos)
    .leftJoin(causas, eq(causas.id, documentos.causaId))
    .leftJoin(user, eq(user.id, documentos.creadoPor));
}

interface Actor {
  userId: string;
  role: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Automatizaciones (llamadas desde lib/tareas.ts dentro de la transacción)
// ─────────────────────────────────────────────────────────────────────────────

export function crearDocumentoDesdeTarea(
  tx: Tx,
  params: { titulo: string; tareaId: string; causaId: string | null; creadoPor: string },
): Documento {
  const nowIso = new Date().toISOString();
  const id = uuidv7();
  tx.insert(documentos)
    .values({
      id,
      titulo: params.titulo,
      tareaId: params.tareaId,
      causaId: params.causaId,
      estado: 'borrador',
      creadoPor: params.creadoPor,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .run();
  audit(
    {
      userId: params.creadoPor,
      entidad: 'documento',
      entidadId: id,
      accion: 'create',
      diff: { origen: 'tarea-en-proceso', tareaId: params.tareaId },
    },
    tx,
  );
  return tx.select().from(documentos).where(eq(documentos.id, id)).get()!;
}

export function marcarDocumentoEnviado(
  tx: Tx,
  documentoId: string,
  actorId: string,
): Documento | undefined {
  const doc = tx.select().from(documentos).where(eq(documentos.id, documentoId)).get();
  if (!doc || doc.estado !== 'borrador') return doc;
  const nowIso = new Date().toISOString();
  tx.update(documentos)
    .set({ estado: 'enviado', updatedAt: nowIso })
    .where(eq(documentos.id, documentoId))
    .run();
  audit(
    { userId: actorId, entidad: 'documento', entidadId: documentoId, accion: 'update', diff: { estado: ['borrador', 'enviado'] } },
    tx,
  );
  return { ...doc, estado: 'enviado', updatedAt: nowIso };
}

// ─────────────────────────────────────────────────────────────────────────────
// Consultas
// ─────────────────────────────────────────────────────────────────────────────

export function listarDocumentos(): DocumentoDTO[] {
  return baseQuery()
    .where(isNull(documentos.deletedAt))
    .orderBy(desc(documentos.updatedAt))
    .all();
}

export function obtenerDocumento(id: string): Documento | undefined {
  return db
    .select()
    .from(documentos)
    .where(and(eq(documentos.id, id), isNull(documentos.deletedAt)))
    .get();
}

export function obtenerDocumentoDTO(id: string): DocumentoDTO | undefined {
  return baseQuery()
    .where(and(eq(documentos.id, id), isNull(documentos.deletedAt)))
    .get();
}

export function obtenerSnapshot(id: string): unknown | null {
  const row = db
    .select({ snapshot: documentoYjs.snapshotJson })
    .from(documentoYjs)
    .where(eq(documentoYjs.documentoId, id))
    .get();
  if (!row?.snapshot) return null;
  return typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutaciones
// ─────────────────────────────────────────────────────────────────────────────

export function crearDocumento(
  input: { titulo: string; causaId?: string | null },
  actor: Actor,
): DocumentoDTO {
  const id = uuidv7();
  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    tx.insert(documentos)
      .values({
        id,
        titulo: input.titulo,
        tareaId: null,
        causaId: input.causaId ?? null,
        estado: 'borrador',
        creadoPor: actor.userId,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();
    audit(
      { userId: actor.userId, entidad: 'documento', entidadId: id, accion: 'create', diff: input },
      tx,
    );
  });
  return obtenerDocumentoDTO(id)!;
}

export function renombrarDocumento(id: string, titulo: string, actor: Actor): DocumentoDTO {
  const doc = obtenerDocumento(id);
  if (!doc) throw errores.noEncontrado('documento');
  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(documentos)
      .set({ titulo, updatedAt: nowIso })
      .where(eq(documentos.id, id))
      .run();
    audit(
      { userId: actor.userId, entidad: 'documento', entidadId: id, accion: 'update', diff: { titulo: [doc.titulo, titulo] } },
      tx,
    );
  });
  return obtenerDocumentoDTO(id)!;
}

/** PLAN §8.2: enviar a revisión (borrador → enviado). */
export function enviarARevision(id: string, actor: Actor): DocumentoDTO {
  const doc = obtenerDocumento(id);
  if (!doc) throw errores.noEncontrado('documento');
  if (doc.estado !== 'borrador') {
    throw errores.conflicto('El documento ya no está en borrador.');
  }
  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(documentos)
      .set({ estado: 'enviado', updatedAt: nowIso })
      .where(eq(documentos.id, id))
      .run();
    audit(
      { userId: actor.userId, entidad: 'documento', entidadId: id, accion: 'update', diff: { estado: ['borrador', 'enviado'] } },
      tx,
    );
  });

  const nombre =
    db.select({ name: user.name }).from(user).where(eq(user.id, actor.userId)).get()?.name ??
    'Alguien';
  crearNotificacion({
    userId: null,
    tipo: 'documento-enviado',
    mensaje: `${nombre} envió a revisión «${doc.titulo}»`,
    link: `/documentos/${id}`,
  });
  emitToAll({ t: 'documento:enviado', documentoId: id, titulo: doc.titulo, por: nombre });

  return obtenerDocumentoDTO(id)!;
}

/** PLAN §8.2: aprobar (solo abogado/admin), enviado → aprobado. */
export function aprobarDocumento(id: string, actor: Actor): DocumentoDTO {
  if (actor.role !== 'admin' && actor.role !== 'abogado') throw errores.sinPermiso();
  const doc = obtenerDocumento(id);
  if (!doc) throw errores.noEncontrado('documento');
  if (doc.estado !== 'enviado') {
    throw errores.conflicto('Solo se pueden aprobar documentos enviados a revisión.');
  }
  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(documentos)
      .set({ estado: 'aprobado', updatedAt: nowIso })
      .where(eq(documentos.id, id))
      .run();
    audit(
      { userId: actor.userId, entidad: 'documento', entidadId: id, accion: 'update', diff: { estado: ['enviado', 'aprobado'] } },
      tx,
    );
  });

  if (doc.creadoPor !== actor.userId) {
    crearNotificacion({
      userId: doc.creadoPor,
      tipo: 'documento-aprobado',
      mensaje: `Aprobaron tu documento «${doc.titulo}»`,
      link: `/documentos/${id}`,
    });
  }
  return obtenerDocumentoDTO(id)!;
}

/** PLAN §8.2: devolver a borrador (abogado/admin) para seguir editando. */
export function devolverABorrador(id: string, actor: Actor): DocumentoDTO {
  if (actor.role !== 'admin' && actor.role !== 'abogado') throw errores.sinPermiso();
  const doc = obtenerDocumento(id);
  if (!doc) throw errores.noEncontrado('documento');
  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(documentos)
      .set({ estado: 'borrador', updatedAt: nowIso })
      .where(eq(documentos.id, id))
      .run();
    audit(
      { userId: actor.userId, entidad: 'documento', entidadId: id, accion: 'update', diff: { estado: [doc.estado, 'borrador'] } },
      tx,
    );
  });
  return obtenerDocumentoDTO(id)!;
}

export function puedeEditarDocumento(doc: Documento, actor: Actor): boolean {
  if (doc.estado === 'aprobado') return actor.role === 'admin' || actor.role === 'abogado';
  return true; // borrador/enviado: cualquier rol con acceso a la sección
}
