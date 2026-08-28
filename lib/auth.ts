import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { uuidv7 } from 'uuidv7';
import { env } from '@/lib/env';
import { APP_NAME } from '@/lib/brand';
import { db } from '@/lib/db';
import {
  account,
  session,
  user,
  verification,
  type Role,
} from '@/lib/db/schema';

/**
 * Better Auth (PLAN §0 / §3): email + contraseña, sesiones por cookie, sin
 * OAuth. Registro público DESHABILITADO — solo un admin crea usuarios
 * (ver `crearUsuario` más abajo y la ruta /admin/usuarios).
 */

function trustedOrigins(): string[] {
  const set = new Set<string>([
    env.BETTER_AUTH_URL,
    'http://localhost:3000',
  ]);
  // Cualquier IP LAN 192.168.x.x / 10.x / 172.16-31.x en el puerto configurado.
  return [...set];
}

export const auth = betterAuth({
  appName: APP_NAME,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: trustedOrigins(),
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: { user, session, account, verification },
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // PLAN §3: registro público deshabilitado
    minPasswordLength: 8,
    autoSignIn: false,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'asistente' satisfies Role,
        input: false, // no se puede fijar desde el cliente
      },
      activo: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 días
    updateAge: 60 * 60 * 24, // renovar si tiene > 1 día
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  advanced: {
    database: {
      generateId: () => uuidv7(),
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session['user'];
