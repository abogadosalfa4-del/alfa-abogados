import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Cifrado simétrico AES-256-GCM para secretos en la BD (PLAN §9.1: refresh
 * tokens de Microsoft Graph). Requiere `ENCRYPTION_KEY` (32 bytes hex).
 */
function clave(): Buffer {
  const hex = process.env.ENCRYPTION_KEY || env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('ENCRYPTION_KEY no configurada (32 bytes hex en .env).');
  }
  return Buffer.from(hex, 'hex');
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', clave(), iv);
  const enc = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function descifrar(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Payload cifrado inválido.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    clave(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
