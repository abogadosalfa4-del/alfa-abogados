import PostalMime from 'postal-mime';

export interface Env {
  CASILLERO: KVNamespace;
  INGEST_SECRET: string;
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

const PREFIX = 'mail:';

export default {
  async email(message, env): Promise<void> {
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);
    const fromAddr =
      parsed.from && 'address' in parsed.from && parsed.from.address
        ? parsed.from.address
        : message.from;
    const id = crypto.randomUUID();
    const row: MailStored = {
      id,
      from: fromAddr,
      to: message.to,
      subject: parsed.subject || '(sin asunto)',
      bodyText: (
        parsed.text || htmlATexto(typeof parsed.html === 'string' ? parsed.html : '')
      ).trim(),
      receivedAt: parsed.date || new Date().toISOString(),
      internetMessageId: parsed.messageId || '',
    };
    await env.CASILLERO.put(`${PREFIX}${id}`, JSON.stringify(row), {
      expirationTtl: 60 * 60 * 24 * 30,
    });
  },

  async fetch(request, env): Promise<Response> {
    if (!autorizado(request, env.INGEST_SECRET)) {
      return json({ error: 'no autorizado' }, 401);
    }
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/pendientes') {
      const list = await env.CASILLERO.list({ prefix: PREFIX, limit: 200 });
      const mails: MailStored[] = [];
      for (const k of list.keys) {
        const raw = await env.CASILLERO.get(k.name);
        if (!raw) continue;
        try {
          mails.push(JSON.parse(raw) as MailStored);
        } catch {
          /* skip */
        }
      }
      return json({ mails });
    }

    if (request.method === 'POST' && url.pathname === '/ack') {
      const body = (await request.json()) as { ids?: string[] };
      const ids = Array.isArray(body.ids) ? body.ids : [];
      await Promise.all(ids.map((id) => env.CASILLERO.delete(`${PREFIX}${id}`)));
      return json({ ok: true, borrados: ids.length });
    }

    if (request.method === 'GET' && url.pathname === '/salud') {
      return json({ ok: true, dominio: 'outbite.app' });
    }

    return json({ error: 'no encontrado' }, 404);
  },
} satisfies ExportedHandler<Env>;

function autorizado(request: Request, secret: string): boolean {
  if (!secret) return false;
  const h = request.headers.get('authorization') ?? '';
  return h === `Bearer ${secret}`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function htmlATexto(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+\n/g, '\n')
    .trim();
}
