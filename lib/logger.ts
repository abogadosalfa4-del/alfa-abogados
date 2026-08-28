import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pino, transport as pinoTransport, type Logger } from 'pino';
import { env } from '@/lib/env';

/**
 * Logger central (PLAN §0.1.12): pino a `logs/app.log` con rotación diaria
 * (pino-roll, 30 archivos). En desarrollo además imprime bonito en consola.
 * Nunca se filtran stack traces al cliente; esto es solo servidor.
 */

const logsDir = resolve(process.cwd(), 'logs');
mkdirSync(logsDir, { recursive: true });

const isDev = env.NODE_ENV !== 'production';

function buildLogger(): Logger {
  try {
    const transport = pinoTransport({
      targets: [
        {
          target: 'pino-roll',
          level: 'info',
          options: {
            file: resolve(logsDir, 'app'),
            extension: '.log',
            frequency: 'daily',
            dateFormat: 'yyyy-MM-dd',
            mkdir: true,
            limit: { count: 30 },
          },
        },
        ...(isDev
          ? [
              {
                target: 'pino-pretty' as const,
                level: 'debug' as const,
                options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
              },
            ]
          : []),
      ],
    });
    return pino(
      { level: isDev ? 'debug' : 'info', base: { pid: process.pid } },
      transport,
    );
  } catch {
    // Fallback: si el transporte por worker falla, log plano a stdout.
    return pino({ level: isDev ? 'debug' : 'info' });
  }
}

const globalForLog = globalThis as unknown as { __bufeteLogger?: Logger };

export const logger: Logger = globalForLog.__bufeteLogger ?? buildLogger();
if (!globalForLog.__bufeteLogger) globalForLog.__bufeteLogger = logger;

/** Logger hijo con un contexto fijo (ej. `log('sadje')`). */
export function log(scope: string): Logger {
  return logger.child({ scope });
}
