import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sadjeCache } from '@/lib/db/schema';

/** Caché de e-SATJE (PLAN §5.2): TTL 12 h. "Sincronizar ahora" lo ignora. */
const TTL_MS = 12 * 60 * 60 * 1000;

export function leerCache<T>(clave: string): T | null {
  const row = db
    .select()
    .from(sadjeCache)
    .where(eq(sadjeCache.clave, clave))
    .get();
  if (!row) return null;
  if (new Date(row.expiraAt).getTime() < Date.now()) return null;
  return row.payloadJson as T;
}

export function guardarCache(clave: string, payload: unknown): void {
  const expiraAt = new Date(Date.now() + TTL_MS).toISOString();
  db.insert(sadjeCache)
    .values({ clave, payloadJson: payload as object, expiraAt })
    .onConflictDoUpdate({
      target: sadjeCache.clave,
      set: { payloadJson: payload as object, expiraAt },
    })
    .run();
}
