import { eq } from 'drizzle-orm';
import {
  PublicClientApplication,
  type Configuration,
  type TokenCacheContext,
} from '@azure/msal-node';
import { db } from '@/lib/db';
import { graphTokens } from '@/lib/db/schema';
import { cifrar, descifrar } from '@/lib/crypto';
import { log } from '@/lib/logger';
import {
  graphClientId,
  graphEncryptionKey,
  graphListo,
  graphTenantId,
} from '@/lib/outlook/env-graph';

const logger = log('graph');
const SCOPES = ['Mail.Read', 'offline_access'];

export function graphConfigurado(): boolean {
  return graphListo();
}

// ── Cache de MSAL persistido cifrado en graph_tokens ─────────────────────────
function cachePlugin(userId: string) {
  return {
    beforeCacheAccess: async (ctx: TokenCacheContext) => {
      const row = db
        .select({ blob: graphTokens.refreshTokenCifrado })
        .from(graphTokens)
        .where(eq(graphTokens.userId, userId))
        .get();
      if (row?.blob) {
        try {
          ctx.tokenCache.deserialize(descifrar(row.blob));
        } catch (err) {
          logger.warn({ err }, 'no se pudo descifrar el cache de Graph');
        }
      }
    },
    afterCacheAccess: async (ctx: TokenCacheContext) => {
      if (!ctx.cacheHasChanged) return;
      const serial = ctx.tokenCache.serialize();
      const nowIso = new Date().toISOString();
      db.insert(graphTokens)
        .values({
          userId,
          refreshTokenCifrado: cifrar(serial),
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: graphTokens.userId,
          set: { refreshTokenCifrado: cifrar(serial), updatedAt: nowIso },
        })
        .run();
    },
  };
}

function pca(userId: string): PublicClientApplication {
  const clientId = graphClientId();
  if (!clientId || !graphEncryptionKey()) {
    throw new Error('Microsoft Graph no está configurado.');
  }
  const config: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${graphTenantId()}`,
    },
    cache: { cachePlugin: cachePlugin(userId) },
  };
  return new PublicClientApplication(config);
}

// ── Estado de conexión ──────────────────────────────────────────────────────
export interface EstadoDeviceCode {
  userCode: string;
  verificationUri: string;
  mensaje: string;
}

const pendientes = new Map<string, EstadoDeviceCode>();

export function estadoConexion(userId: string): {
  configurado: boolean;
  conectado: boolean;
  pendiente: EstadoDeviceCode | null;
} {
  const row = db
    .select({ userId: graphTokens.userId })
    .from(graphTokens)
    .where(eq(graphTokens.userId, userId))
    .get();
  return {
    configurado: graphConfigurado(),
    conectado: Boolean(row),
    pendiente: pendientes.get(userId) ?? null,
  };
}

/** Inicia el flujo device-code (PLAN §9.1). Devuelve el código para mostrar. */
export async function iniciarDeviceCode(userId: string): Promise<EstadoDeviceCode> {
  if (!graphConfigurado()) throw new Error('Microsoft Graph no está configurado.');

  return new Promise<EstadoDeviceCode>((resolve, reject) => {
    let resuelto = false;
    pca(userId)
      .acquireTokenByDeviceCode({
        scopes: SCOPES,
        deviceCodeCallback: (info) => {
          const estado: EstadoDeviceCode = {
            userCode: info.userCode,
            verificationUri: info.verificationUri,
            mensaje: info.message,
          };
          pendientes.set(userId, estado);
          resuelto = true;
          resolve(estado);
        },
      })
      .then(() => {
        pendientes.delete(userId);
        logger.info({ userId }, 'buzón vinculado a Graph');
      })
      .catch((err) => {
        pendientes.delete(userId);
        logger.warn({ err, userId }, 'device-code falló');
        if (!resuelto) reject(err);
      });
  });
}

export function desconectar(userId: string): void {
  db.delete(graphTokens).where(eq(graphTokens.userId, userId)).run();
  pendientes.delete(userId);
}

// ── Traer mensajes ──────────────────────────────────────────────────────────
export interface MensajeGraph {
  id: string;
  subject: string;
  from: string;
  receivedDateTime: string;
  bodyPreview: string;
}

export async function traerMensajes(userId: string): Promise<MensajeGraph[]> {
  const token = await accessToken(userId);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const filtro = `receivedDateTime ge ${hoy.toISOString()}`;
  const url = `https://graph.microsoft.com/v1.0/me/messages?$top=50&$select=subject,from,receivedDateTime,bodyPreview&$filter=${encodeURIComponent(filtro)}&$orderby=receivedDateTime desc`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Graph respondió ${r.status}`);
  const json = (await r.json()) as {
    value: {
      id: string;
      subject: string;
      from?: { emailAddress?: { address?: string; name?: string } };
      receivedDateTime: string;
      bodyPreview: string;
    }[];
  };
  return json.value.map((m) => ({
    id: m.id,
    subject: m.subject ?? '(sin asunto)',
    from: m.from?.emailAddress?.address ?? m.from?.emailAddress?.name ?? '',
    receivedDateTime: m.receivedDateTime,
    bodyPreview: m.bodyPreview ?? '',
  }));
}

export interface MensajeCasillero {
  id: string;
  internetMessageId: string;
  subject: string;
  from: string;
  receivedDateTime: string;
  bodyPreview: string;
  bodyText: string;
}

async function accessToken(userId: string): Promise<string> {
  const app = pca(userId);
  const cuentas = await app.getTokenCache().getAllAccounts();
  const cuenta = cuentas[0];
  if (!cuenta) throw new Error('El buzón no está vinculado.');
  const res = await app.acquireTokenSilent({ account: cuenta, scopes: SCOPES });
  if (!res?.accessToken) throw new Error('No se pudo renovar el acceso a Graph.');
  return res.accessToken;
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
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Mails recientes (90 días) con cuerpo. El filtro fino de casillero se hace
 * en código: Graph no filtra bien por «casillero electrónico».
 */
export async function traerMensajesCasillero(
  userId: string,
  opts: { dias?: number; max?: number } = {},
): Promise<MensajeCasillero[]> {
  const token = await accessToken(userId);
  const dias = opts.dias ?? 90;
  const max = opts.max ?? 250;
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  const filtro = `receivedDateTime ge ${desde.toISOString()}`;
  let url =
    `https://graph.microsoft.com/v1.0/me/messages?$top=50` +
    `&$select=id,internetMessageId,subject,from,receivedDateTime,body,bodyPreview` +
    `&$filter=${encodeURIComponent(filtro)}&$orderby=receivedDateTime desc`;

  const out: MensajeCasillero[] = [];
  while (url && out.length < max) {
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.body-content-type="text"',
      },
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`Graph respondió ${r.status} al leer el casillero.${t ? ` ${t.slice(0, 180)}` : ''}`);
    }
    const json = (await r.json()) as {
      '@odata.nextLink'?: string;
      value: {
        id: string;
        internetMessageId?: string;
        subject?: string;
        from?: { emailAddress?: { address?: string; name?: string } };
        receivedDateTime: string;
        bodyPreview?: string;
        body?: { contentType?: string; content?: string };
      }[];
    };
    for (const m of json.value) {
      const raw = m.body?.content ?? '';
      const bodyText =
        (m.body?.contentType ?? '').toLowerCase() === 'html' ? htmlATexto(raw) : raw;
      out.push({
        id: m.id,
        internetMessageId: m.internetMessageId ?? '',
        subject: m.subject ?? '(sin asunto)',
        from: m.from?.emailAddress?.address ?? m.from?.emailAddress?.name ?? '',
        receivedDateTime: m.receivedDateTime,
        bodyPreview: m.bodyPreview ?? '',
        bodyText: bodyText.trim(),
      });
      if (out.length >= max) break;
    }
    url = json['@odata.nextLink'] ?? '';
  }
  return out;
}
