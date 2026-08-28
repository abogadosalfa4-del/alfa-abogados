'use client';

import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import type { auth } from '@/lib/auth';

/**
 * Cliente de Better Auth para componentes de cliente (PLAN §3).
 * `inferAdditionalFields` propaga el tipo de `role` / `activo` al `useSession`.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const { signIn, signOut, useSession, getSession } = authClient;
