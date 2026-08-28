'use client';

import { uuidv7 } from 'uuidv7';

/**
 * Cliente HTTP para el navegador. Nunca se hace fetch dentro de useEffect
 * (PLAN §0): las lecturas van por SWR con `fetcher`; las mutaciones por
 * `apiMutate` (que añade Idempotency-Key en los POST).
 * Idempotency-Key usa uuidv7: `crypto.randomUUID` no existe en HTTP por LAN.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } })?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'http_error',
      err?.message ?? `Error ${res.status}`,
    );
  }
  return json;
}

export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  return (await parse(res)) as T;
}

type Metodo = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function apiMutate<T = unknown>(
  url: string,
  metodo: Metodo,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (metodo === 'POST') headers['Idempotency-Key'] = uuidv7();

  const res = await fetch(url, {
    method: metodo,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await parse(res)) as T;
}
