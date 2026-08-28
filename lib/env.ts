import 'dotenv/config';
import { z } from 'zod';

/**
 * Validación central de variables de entorno. Se importa desde `server.ts` y
 * desde cualquier módulo de servidor. Falla ruidosamente al boot si algo falta.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  DATABASE_PATH: z.string().min(1).default('./data/bufete.db'),
  BETTER_AUTH_SECRET: z
    .string()
    .min(16, 'BETTER_AUTH_SECRET debe tener al menos 16 caracteres (usar `openssl rand -base64 32`)'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),
  PORT: z.coerce.number().int().positive().default(3000),

  GEMINI_API_KEY: z.string().optional(),
  WEB_SEARCH_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  MSGRAPH_CLIENT_ID: z.string().optional(),
  MSGRAPH_TENANT_ID: z.string().default('common'),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY debe ser 32 bytes en hex (64 chars). Usar `openssl rand -hex 32`')
    .optional(),

  CASILLERO_WORKER_URL: z.string().optional(),
  CASILLERO_WORKER_SECRET: z.string().optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    // Sin dependencias: esto corre antes de que exista el logger.
    console.error(`\n✖ Configuración inválida en .env:\n${issues}\n`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
