import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { env } from '@/lib/env';

const ENV_PATH = resolve(process.cwd(), '.env');
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function graphClientId(): string | undefined {
  return emptyToUndef(process.env.MSGRAPH_CLIENT_ID) ?? emptyToUndef(env.MSGRAPH_CLIENT_ID);
}

export function graphTenantId(): string {
  return (
    emptyToUndef(process.env.MSGRAPH_TENANT_ID) ??
    emptyToUndef(env.MSGRAPH_TENANT_ID) ??
    'common'
  );
}

export function graphEncryptionKey(): string | undefined {
  return emptyToUndef(process.env.ENCRYPTION_KEY) ?? emptyToUndef(env.ENCRYPTION_KEY);
}

export function graphListo(): boolean {
  return Boolean(graphClientId() && graphEncryptionKey());
}

export function esClientIdValido(id: string): boolean {
  return UUID_RE.test(id.trim());
}

function emptyToUndef(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

export function upsertEnvLine(key: string, value: string): void {
  let text = '';
  try {
    text = readFileSync(ENV_PATH, 'utf8');
  } catch {
    text = '';
  }
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, line);
  else text = `${text.replace(/\s*$/, '')}\n${line}\n`;
  writeFileSync(ENV_PATH, text, 'utf8');
  process.env[key] = value;
}

/** Genera ENCRYPTION_KEY si falta. No loguea el valor. */
export function asegurarEncryptionKey(): void {
  if (graphEncryptionKey()) return;
  const hex = randomBytes(32).toString('hex');
  upsertEnvLine('ENCRYPTION_KEY', hex);
}

export function guardarGraphApp(clientId: string, tenantId = 'common'): void {
  const id = clientId.trim();
  if (!esClientIdValido(id)) {
    throw new Error('El Id. de aplicación no parece un UUID de Entra ID.');
  }
  asegurarEncryptionKey();
  upsertEnvLine('MSGRAPH_CLIENT_ID', id);
  upsertEnvLine('MSGRAPH_TENANT_ID', tenantId.trim() || 'common');
}
