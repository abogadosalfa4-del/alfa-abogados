import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { imapCasillero } from '@/lib/db/schema';
import { cifrar, descifrar } from '@/lib/crypto';
import { asegurarEncryptionKey } from '@/lib/outlook/env-graph';
import type { MensajeCasillero } from '@/lib/outlook/graph';
import { log } from '@/lib/logger';

const logger = log('imap');
export const IMAP_OFICINA_ID = 'oficina';
const GMAIL_HOST = 'imap.gmail.com';
const GMAIL_PORT = 993;

export type EstadoImap = {
  conectado: boolean;
  usuario: string | null;
  host: string | null;
};

export function estadoImap(): EstadoImap {
  const row = db
    .select({
      usuario: imapCasillero.usuario,
      host: imapCasillero.host,
    })
    .from(imapCasillero)
    .where(eq(imapCasillero.id, IMAP_OFICINA_ID))
    .get();
  return {
    conectado: Boolean(row),
    usuario: row?.usuario ?? null,
    host: row?.host ?? null,
  };
}

export function userIdImap(): string | null {
  return (
    db
      .select({ id: imapCasillero.configuradoPor })
      .from(imapCasillero)
      .where(eq(imapCasillero.id, IMAP_OFICINA_ID))
      .get()?.id ?? null
  );
}

function credenciales(): { host: string; port: number; user: string; pass: string } | null {
  const row = db.select().from(imapCasillero).where(eq(imapCasillero.id, IMAP_OFICINA_ID)).get();
  if (!row) return null;
  return {
    host: row.host,
    port: row.port,
    user: row.usuario,
    pass: descifrar(row.passwordCifrado),
  };
}

function cliente(auth: { host: string; port: number; user: string; pass: string }): ImapFlow {
  return new ImapFlow({
    host: auth.host,
    port: auth.port,
    secure: true,
    auth: { user: auth.user, pass: auth.pass },
    logger: false,
  });
}

async function conBuzon<T>(
  auth: { host: string; port: number; user: string; pass: string },
  fn: (c: ImapFlow) => Promise<T>,
): Promise<T> {
  const c = cliente(auth);
  try {
    await c.connect();
    return await fn(c);
  } catch (err) {
    throw traducirErrorImap(err);
  } finally {
    try {
      await c.logout();
    } catch {
      /* noop */
    }
  }
}

function traducirErrorImap(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  const t = raw.toLowerCase();
  if (t.includes('invalid credentials') || t.includes('authentication failed') || t.includes('auth')) {
    return new Error(
      'Gmail rechazó el acceso. Usá una contraseña de aplicación (16 letras), no la contraseña de la cuenta.',
    );
  }
  if (t.includes('disabled') || t.includes('web login required') || t.includes('application-specific')) {
    return new Error('Activá IMAP en Gmail (Configuración → Reenvío y POP/IMAP) y la verificación en 2 pasos.');
  }
  logger.warn({ err }, 'error IMAP');
  return new Error(raw.slice(0, 220) || 'No se pudo conectar al buzón IMAP.');
}

export function normalizarPasswordApp(raw: string): string {
  return raw.replace(/\s+/g, '');
}

export async function probarImap(usuario: string, password: string): Promise<void> {
  const pass = normalizarPasswordApp(password);
  await conBuzon(
    { host: GMAIL_HOST, port: GMAIL_PORT, user: usuario.trim(), pass },
    async (c) => {
      const lock = await c.getMailboxLock('INBOX');
      lock.release();
    },
  );
}

export function guardarImap(opts: {
  usuario: string;
  password: string;
  configuradoPor: string;
}): EstadoImap {
  asegurarEncryptionKey();
  const usuario = opts.usuario.trim().toLowerCase();
  const pass = normalizarPasswordApp(opts.password);
  const now = new Date().toISOString();
  db.insert(imapCasillero)
    .values({
      id: IMAP_OFICINA_ID,
      host: GMAIL_HOST,
      port: GMAIL_PORT,
      usuario,
      passwordCifrado: cifrar(pass),
      configuradoPor: opts.configuradoPor,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: imapCasillero.id,
      set: {
        host: GMAIL_HOST,
        port: GMAIL_PORT,
        usuario,
        passwordCifrado: cifrar(pass),
        configuradoPor: opts.configuradoPor,
        updatedAt: now,
      },
    })
    .run();
  return estadoImap();
}

export function borrarImap(): void {
  db.delete(imapCasillero).where(eq(imapCasillero.id, IMAP_OFICINA_ID)).run();
}

export async function traerMensajesImap(
  opts: { dias?: number; max?: number } = {},
): Promise<MensajeCasillero[]> {
  const auth = credenciales();
  if (!auth) throw new Error('No hay un buzón Gmail configurado.');
  const dias = opts.dias ?? 90;
  const max = opts.max ?? 250;
  const since = new Date();
  since.setDate(since.getDate() - dias);

  return conBuzon(auth, async (c) => {
    const lock = await c.getMailboxLock('INBOX');
    const out: MensajeCasillero[] = [];
    try {
      for await (const msg of c.fetch(
        { since },
        { uid: true, envelope: true, source: true, internalDate: true },
      )) {
        if (out.length >= max) break;
        const raw = msg.source;
        if (!raw) continue;
        const parsed = await simpleParser(raw);
        const from =
          parsed.from?.value[0]?.address ??
          msg.envelope?.from?.[0]?.address ??
          '';
        const subject = parsed.subject || msg.envelope?.subject || '(sin asunto)';
        const bodyText = (parsed.text || htmlATexto(parsed.html || '')).trim();
        const receivedAt = parsed.date ?? msg.internalDate ?? new Date();
        const received =
          receivedAt instanceof Date
            ? receivedAt.toISOString()
            : new Date(receivedAt).toISOString();
        out.push({
          id: `imap:${auth.user}:${msg.uid}`,
          internetMessageId: parsed.messageId || '',
          subject,
          from,
          receivedDateTime: received,
          bodyPreview: bodyText.slice(0, 280),
          bodyText,
        });
      }
    } finally {
      lock.release();
    }
    return out;
  });
}

function htmlATexto(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
