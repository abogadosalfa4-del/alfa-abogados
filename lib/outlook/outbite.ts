import { env } from '@/lib/env';
import { upsertEnvLine } from '@/lib/outlook/env-graph';
import type { MensajeCasillero } from '@/lib/outlook/graph';

export const CASILLERO_OUTBITE = 'casillero@outbite.app';

function workerUrl(): string | undefined {
  return empty(process.env.CASILLERO_WORKER_URL) ?? empty(env.CASILLERO_WORKER_URL);
}

function workerSecret(): string | undefined {
  return empty(process.env.CASILLERO_WORKER_SECRET) ?? empty(env.CASILLERO_WORKER_SECRET);
}

function empty(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

export function estadoOutbite(): { configurado: boolean; direccion: string; workerUrl: string | null } {
  const url = workerUrl();
  return {
    configurado: Boolean(url && workerSecret()),
    direccion: CASILLERO_OUTBITE,
    workerUrl: url ?? null,
  };
}

export function guardarOutbite(opts: { workerUrl: string; secret: string }): void {
  const url = opts.workerUrl.trim().replace(/\/$/, '');
  if (!/^https:\/\//i.test(url)) {
    throw new Error('La URL del Worker tiene que ser https://…');
  }
  upsertEnvLine('CASILLERO_WORKER_URL', url);
  upsertEnvLine('CASILLERO_WORKER_SECRET', opts.secret.trim());
}

type MailStored = {
  id: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
  internetMessageId: string;
};

export async function traerMensajesOutbite(): Promise<MensajeCasillero[]> {
  const url = workerUrl();
  const secret = workerSecret();
  if (!url || !secret) throw new Error('Casillero outbite.app no está configurado.');

  const headers = {
    Authorization: `Bearer ${secret}`,
    'User-Agent': 'despacho-legal/casillero',
  };
  const r = await fetch(`${url}/pendientes`, { headers });
  if (!r.ok) {
    throw new Error(`Worker outbite.app respondió ${r.status}.`);
  }
  const json = (await r.json()) as { mails?: MailStored[] };
  const mails = json.mails ?? [];
  return mails.map((m) => ({
    id: `outbite:${m.id}`,
    internetMessageId: m.internetMessageId,
    subject: m.subject,
    from: m.from,
    receivedDateTime: m.receivedAt,
    bodyPreview: m.bodyText.slice(0, 280),
    bodyText: m.bodyText,
  }));
}

export async function acusarOutbite(idsOutbite: string[]): Promise<void> {
  const url = workerUrl();
  const secret = workerSecret();
  if (!url || !secret || idsOutbite.length === 0) return;
  const ids = idsOutbite.map((id) => id.replace(/^outbite:/, ''));
  await fetch(`${url}/ack`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      'User-Agent': 'despacho-legal/casillero',
    },
    body: JSON.stringify({ ids }),
  });
}

export async function probarOutbite(urlRaw: string, secret: string): Promise<void> {
  const url = urlRaw.trim().replace(/\/$/, '');
  const r = await fetch(`${url}/salud`, {
    headers: {
      Authorization: `Bearer ${secret.trim()}`,
      'User-Agent': 'despacho-legal/casillero',
    },
  });
  if (!r.ok) {
    throw new Error('No se pudo hablar con el Worker. Revisá URL y secreto.');
  }
}
