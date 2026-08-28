import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import type { Doc as YDoc } from 'yjs';
import { Hocuspocus } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documentos, documentoYjs } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { resolverSesion } from '@/lib/auth-local';

const logger = log('collab');

/**
 * Editor colaborativo (PLAN §1.1 / §8.3):
 *  - path WS `/collab`, montado en el mismo proceso que Next + Socket.IO.
 *  - `onAuthenticate`: valida la sesión de Better Auth (cookie del handshake) y
 *    que el documento exista; los borradores/enviados son de solo lectura para
 *    quien no puede editarlos.
 *  - extensión `Database`: persiste el update binario de Yjs con debounce 2 s
 *    y guarda un snapshot JSON (Tiptap) cada 30 s para export/preview/búsqueda.
 */

interface CollabContext {
  userId: string;
  role: string;
}

const globalForHp = globalThis as unknown as { __bufeteHocuspocus?: Hocuspocus };

const ultimoSnapshot = new Map<string, number>();
const SNAPSHOT_CADA_MS = 30_000;

function cookieDe(requestHeaders: Record<string, string | string[] | undefined>): string {
  const c = requestHeaders['cookie'];
  return Array.isArray(c) ? c.join('; ') : (c ?? '');
}

export function getHocuspocus(): Hocuspocus {
  if (globalForHp.__bufeteHocuspocus) return globalForHp.__bufeteHocuspocus;

  const server = new Hocuspocus({
    name: 'bufete-collab',
    debounce: 2000,
    maxDebounce: 10_000,
    quiet: true,

    async onAuthenticate({ token, requestHeaders, documentName, connection }) {
      const cookie = cookieDe(requestHeaders) || token;
      const session = await resolverSesion(new Headers({ cookie }));
      if (!session?.user) throw new Error('Sesión inválida');

      const doc = db
        .select({
          id: documentos.id,
          estado: documentos.estado,
          deletedAt: documentos.deletedAt,
        })
        .from(documentos)
        .where(eq(documentos.id, documentName))
        .get();
      if (!doc || doc.deletedAt) throw new Error('Documento no encontrado');

      const role = (session.user as { role?: string }).role ?? 'asistente';
      // PLAN §8.2: aprobado => solo lectura para todos salvo admin/abogado.
      connection.readOnly =
        doc.estado === 'aprobado' && role !== 'admin' && role !== 'abogado';

      return { userId: session.user.id, role } satisfies CollabContext;
    },

    extensions: [
      new Database({
        fetch: async ({ documentName }) => {
          const row = db
            .select({ estado: documentoYjs.estadoBinario })
            .from(documentoYjs)
            .where(eq(documentoYjs.documentoId, documentName))
            .get();
          return row?.estado ? (row.estado as Uint8Array) : null;
        },
        store: async ({ documentName, state, document }) => {
          const nowIso = new Date().toISOString();
          let snapshotJson: string | null = null;

          const prev = ultimoSnapshot.get(documentName) ?? 0;
          if (Date.now() - prev > SNAPSHOT_CADA_MS) {
            try {
              const json = TiptapTransformer.fromYdoc(document as YDoc, 'default');
              snapshotJson = JSON.stringify(json);
              ultimoSnapshot.set(documentName, Date.now());
            } catch (err) {
              logger.warn({ err, documentName }, 'no se pudo generar snapshot JSON');
            }
          }

          db.insert(documentoYjs)
            .values({
              documentoId: documentName,
              estadoBinario: state,
              snapshotJson,
              updatedAt: nowIso,
            })
            .onConflictDoUpdate({
              target: documentoYjs.documentoId,
              set: {
                estadoBinario: state,
                updatedAt: nowIso,
                ...(snapshotJson ? { snapshotJson } : {}),
              },
            })
            .run();

          db.update(documentos)
            .set({ updatedAt: nowIso })
            .where(eq(documentos.id, documentName))
            .run();
        },
      }),
    ],
  });

  globalForHp.__bufeteHocuspocus = server;
  return server;
}

/** Maneja una conexión WebSocket entrante en el path `/collab`. */
export function handleCollabConnection(
  ws: WebSocket,
  request: IncomingMessage,
): void {
  try {
    getHocuspocus().handleConnection(ws, request);
  } catch (err) {
    logger.error({ err }, 'error manejando conexión /collab');
    ws.close();
  }
}
