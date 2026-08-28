import { cache } from 'react';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { z, ZodError, type ZodType } from 'zod';
import { eq } from 'drizzle-orm';
import { type Session } from '@/lib/auth';
import { db } from '@/lib/db';
import { idempotencyKeys } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { HttpError, errores } from '@/lib/errores';
import type { Role } from '@/lib/db/schema';
import { resolverSesion } from '@/lib/auth-local';

const logger = log('http');

export { HttpError, errores };

// ─────────────────────────────────────────────────────────────────────────────
// Sesión y roles (PLAN §3)
// ─────────────────────────────────────────────────────────────────────────────

async function leerSesion(): Promise<Session | null> {
  try {
    return await resolverSesion(await headers());
  } catch {
    return resolverSesion();
  }
}

/** Dedup en un mismo render RSC (layout + page). En APIs no usa cache(). */
export const getSession = cache(leerSesion);

export interface Actor {
  session: Session;
  userId: string;
  role: Role;
}

export async function requireSession(): Promise<Actor> {
  const session = await leerSesion();
  if (!session?.user) throw errores.noAutenticado();
  const role = ((session.user as { role?: Role }).role ?? 'asistente') as Role;
  return { session, userId: session.user.id, role };
}

export async function requireRole(...roles: Role[]): Promise<Actor> {
  const actor = await requireSession();
  if (!roles.includes(actor.role)) throw errores.sinPermiso();
  return actor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parseo con Zod en TODOS los bordes (PLAN §0.1 / §16)
// ─────────────────────────────────────────────────────────────────────────────

export async function parseBody<S extends ZodType>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw errores.validacion('El cuerpo de la petición no es JSON válido.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw errores.validacion(formatZod(parsed.error));
  }
  return parsed.data;
}

export function parseQuery<S extends ZodType>(url: string, schema: S): z.infer<S> {
  const params = Object.fromEntries(new URL(url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw errores.validacion(formatZod(parsed.error));
  return parsed.data;
}

function formatZod(err: ZodError): string {
  return err.issues
    .map((i) => `${i.path.join('.') || 'valor'}: ${i.message}`)
    .join('; ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Envoltura de route handlers (PLAN §0.1.12): try/catch + envelope de error.
// Se usa dentro de cada handler para no interferir con la validación de tipos
// de rutas de Next.
// ─────────────────────────────────────────────────────────────────────────────

export async function handleErrors(
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status },
      );
    }
    logger.error({ err }, 'error no controlado en route handler');
    return NextResponse.json(
      { error: { code: 'interno', message: 'Ocurrió un error inesperado.' } },
      { status: 500 },
    );
  }
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  return NextResponse.json(data, init);
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotencia (PLAN §0.1.13): header `Idempotency-Key`, TTL 24 h
// ─────────────────────────────────────────────────────────────────────────────

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Si la petición trae `Idempotency-Key` y ya se procesó, devuelve la respuesta
 * cacheada. Si no, ejecuta `fn`, guarda su resultado y lo devuelve.
 */
export async function withIdempotency<T>(
  req: Request,
  fn: () => Promise<T>,
): Promise<{ data: T; replayed: boolean }> {
  const key = req.headers.get('Idempotency-Key');
  if (!key) return { data: await fn(), replayed: false };

  const now = Date.now();
  const existing = db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .get();

  if (existing && new Date(existing.expiraAt).getTime() > now) {
    return { data: existing.respuestaJson as T, replayed: true };
  }

  const data = await fn();
  const expiraAt = new Date(now + IDEMPOTENCY_TTL_MS).toISOString();
  db.insert(idempotencyKeys)
    .values({ key, respuestaJson: data as object, expiraAt })
    .onConflictDoUpdate({
      target: idempotencyKeys.key,
      set: { respuestaJson: data as object, expiraAt },
    })
    .run();

  return { data, replayed: false };
}
