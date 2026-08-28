'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { fetcher } from '@/lib/api';
import type { Role } from '@/lib/db/schema';

export type SesionOficina = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

const SesionCtx = createContext<SesionOficina | null>(null);

export function useSesion(): SesionOficina {
  const s = useContext(SesionCtx);
  if (!s) throw new Error('useSesion requiere Providers');
  return s;
}

const EDITORES: Role[] = ['admin', 'abogado', 'secretario'];

export function esEditor(role: Role): boolean {
  return EDITORES.includes(role);
}

export function Providers({
  user,
  children,
}: {
  user: SesionOficina;
  children: ReactNode;
}) {
  return (
    <SWRConfig
      value={{
        fetcher,
        dedupingInterval: 8000,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        keepPreviousData: true,
      }}
    >
      <SesionCtx.Provider value={user}>{children}</SesionCtx.Provider>
    </SWRConfig>
  );
}
