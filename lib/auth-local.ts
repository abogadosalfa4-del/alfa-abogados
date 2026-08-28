import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { auth, type Session } from '@/lib/auth';

/**
 * Oficina sin login: si no hay cookie de sesión, se usa el primer admin
 * de la BD. El sistema corre en la PC del despacho.
 */
export async function resolverSesion(headersInit?: Headers): Promise<Session | null> {
  if (headersInit) {
    try {
      const real = await auth.api.getSession({ headers: headersInit });
      if (real?.user) return real;
    } catch {
      /* sin cookie / cookie inválida → oficina abierta */
    }
  }
  return sesionOficina();
}

let cacheOficina: { at: number; value: Session | null } | null = null;
const TTL_OFICINA_MS = 30_000;

export function sesionOficina(): Session | null {
  const nowMs = Date.now();
  if (cacheOficina && nowMs - cacheOficina.at < TTL_OFICINA_MS) {
    return cacheOficina.value;
  }
  const u =
    db.select().from(user).where(eq(user.role, 'admin')).get() ??
    db.select().from(user).get();
  if (!u) {
    cacheOficina = { at: nowMs, value: null };
    return null;
  }

  const now = new Date();
  const value = {
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: Boolean(u.emailVerified),
      image: u.image,
      createdAt: u.createdAt instanceof Date ? u.createdAt : now,
      updatedAt: u.updatedAt instanceof Date ? u.updatedAt : now,
      role: u.role,
      activo: u.activo,
    },
    session: {
      id: 'oficina',
      userId: u.id,
      expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      token: 'oficina',
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
  } as Session;
  cacheOficina = { at: nowMs, value };
  return value;
}
