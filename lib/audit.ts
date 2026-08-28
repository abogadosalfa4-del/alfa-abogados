import { uuidv7 } from 'uuidv7';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';

type Accion = 'create' | 'update' | 'delete';

/** Objeto mínimo capaz de insertar (db o una transacción de Drizzle). */
type Inserter = Pick<typeof db, 'insert'>;

export interface AuditParams {
  userId: string | null;
  entidad: string;
  entidadId: string;
  accion: Accion;
  /** Para update: diff `{campo: [antes, despues]}`. Para create/delete: snapshot. */
  diff?: unknown;
}

/**
 * Registra una fila en `audit_log` (PLAN §0.1.4). Debe llamarse DENTRO de la
 * misma transacción que la mutación de negocio; por eso acepta el `tx`.
 */
export function audit(params: AuditParams, tx: Inserter = db): void {
  tx.insert(auditLog)
    .values({
      id: uuidv7(),
      userId: params.userId,
      entidad: params.entidad,
      entidadId: params.entidadId,
      accion: params.accion,
      diffJson: params.diff === undefined ? null : (params.diff as object),
      createdAt: new Date().toISOString(),
    })
    .run();
}

/**
 * Diff superficial entre dos registros: solo las claves cuyo valor cambió,
 * como `{ clave: [antes, despues] }`. Ignora columnas de sistema.
 */
export function computeDiff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  ignore: readonly string[] = ['updatedAt', 'createdAt'],
): Record<string, [unknown, unknown]> {
  const diff: Record<string, [unknown, unknown]> = {};
  for (const key of Object.keys(after)) {
    if (ignore.includes(key)) continue;
    const a = before[key as keyof T];
    const b = after[key as keyof T];
    if (!Object.is(a, b)) diff[key] = [a, b];
  }
  return diff;
}
