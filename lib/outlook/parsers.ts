import MsgReader from '@kenjiuno/msgreader';
import { simpleParser } from 'mailparser';

export interface CorreoParseado {
  subject: string;
  from: string;
  receivedAt: string | null; // ISO
  bodyText: string;
}

/** Parsea un `.msg` de Outlook (PLAN §4.4.4). */
export function parseMsg(buffer: Buffer): CorreoParseado {
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  const reader = new MsgReader(ab);
  const data = reader.getFileData() as {
    subject?: string;
    senderEmail?: string;
    senderName?: string;
    body?: string;
    bodyHtml?: string;
    messageDeliveryTime?: string;
    clientSubmitTime?: string;
  };
  const fecha = data.messageDeliveryTime ?? data.clientSubmitTime;
  return {
    subject: (data.subject ?? '').trim(),
    from: (data.senderEmail || data.senderName || '').trim(),
    receivedAt: fecha ? new Date(fecha).toISOString() : null,
    bodyText: (data.body ?? stripHtml(data.bodyHtml ?? '')).trim(),
  };
}

/** Parsea un `.eml` (PLAN §4.4.4). */
export async function parseEml(buffer: Buffer): Promise<CorreoParseado> {
  const p = await simpleParser(buffer);
  const from =
    p.from?.value?.[0]?.address ?? p.from?.text ?? '';
  return {
    subject: (p.subject ?? '').trim(),
    from: from.trim(),
    receivedAt: p.date ? p.date.toISOString() : null,
    bodyText: (p.text ?? stripHtml(p.html || '')).trim(),
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
