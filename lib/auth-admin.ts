import { eq } from 'drizzle-orm';
import { createLocalAccountIssuer } from 'better-auth/db';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { user, type Role } from '@/lib/db/schema';
import { audit } from '@/lib/audit';

// Emisor sintético que Better Auth exige en las cuentas de credenciales
// (verificado en el login: account.issuer === createLocalAccountIssuer('credential')).
const CREDENTIAL_ISSUER = createLocalAccountIssuer('credential');

/**
 * Operaciones de administración de usuarios (PLAN §3). No pasan por el endpoint
 * HTTP de signup (deshabilitado): usan el adaptador interno de Better Auth.
 * Solo se invocan desde el seed y desde rutas protegidas con requireRole('admin').
 */

export interface CrearUsuarioParams {
  nombre: string;
  email: string;
  password: string;
  role: Role;
  creadoPor?: string | null;
}

export async function crearUsuario(params: CrearUsuarioParams) {
  const ctx = await auth.$context;
  const email = params.email.trim().toLowerCase();

  const existente = await ctx.internalAdapter.findUserByEmail(email);
  if (existente) {
    throw new Error(`Ya existe un usuario con el correo ${email}`);
  }

  const hash = await ctx.password.hash(params.password);

  const nuevo = await ctx.internalAdapter.createUser(
    {
      email,
      name: params.nombre.trim(),
      emailVerified: true,
      role: params.role,
      activo: true,
    },
    { method: 'admin' },
  );

  await ctx.internalAdapter.linkAccount({
    userId: nuevo.id,
    providerId: 'credential',
    accountId: nuevo.id,
    issuer: CREDENTIAL_ISSUER,
    password: hash,
  });

  audit({
    userId: params.creadoPor ?? null,
    entidad: 'user',
    entidadId: nuevo.id,
    accion: 'create',
    diff: { email, name: params.nombre, role: params.role },
  });

  return nuevo;
}

export async function contarUsuarios(): Promise<number> {
  const rows = db.select({ id: user.id }).from(user).all();
  return rows.length;
}

export async function existeAlgunAdmin(): Promise<boolean> {
  const row = db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, 'admin'))
    .limit(1)
    .get();
  return Boolean(row);
}

export async function cambiarPassword(userId: string, nueva: string) {
  const ctx = await auth.$context;
  await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(nueva));
}

export function setActivo(userId: string, activo: boolean, actorId: string) {
  db.transaction((tx) => {
    tx.update(user)
      .set({ activo, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .run();
    audit(
      { userId: actorId, entidad: 'user', entidadId: userId, accion: 'update', diff: { activo } },
      tx,
    );
  });
}

export function setRole(userId: string, role: Role, actorId: string) {
  db.transaction((tx) => {
    tx.update(user)
      .set({ role, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .run();
    audit(
      { userId: actorId, entidad: 'user', entidadId: userId, accion: 'update', diff: { role } },
      tx,
    );
  });
}
