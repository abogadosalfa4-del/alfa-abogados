import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { env } from '@/lib/env';
import { ipsLan } from '@/lib/lan';
import { logger } from '@/lib/logger';
import { runMigrations } from '@/lib/db/migrate';
import { sqlite } from '@/lib/db';
import { setupSocketIO } from '@/lib/realtime/socket-server';
import { getHocuspocus, handleCollabConnection } from '@/lib/collab/hocuspocus';
import { scheduleBackups } from '@/lib/backups';
import { seedFeriados } from '@/lib/feriados';
import { seedReglasPlazo } from '@/lib/sadje/reglas-seed';
import { repararClientesDesdeCasillero } from '@/lib/clientes';
import { scheduleResumenCorreos, ingestarCasilleroAlArranque } from '@/lib/outlook/cron';
import { scheduleMantenimiento } from '@/lib/mantenimiento';
import { APP_NAME } from '@/lib/brand';

/**
 * Servidor Node custom (PLAN §1.1): un solo proceso sirve
 *   - Next.js 15 (HTTP)
 *   - Socket.IO en `/socket.io`
 *   - Hocuspocus en `/collab` (WebSocketServer noServer, upgrade manual)
 * Escucha en 0.0.0.0 para ser accesible desde la LAN de la oficina.
 */

const dev = env.NODE_ENV !== 'production';
const app = next({ dev, hostname: '0.0.0.0', port: env.PORT });
const handle = app.getRequestHandler();

async function main(): Promise<void> {
  runMigrations();
  seedFeriados();
  seedReglasPlazo();
  const reparo = repararClientesDesdeCasillero();
  logger.info({ ...reparo }, 'migraciones aplicadas');

  await app.prepare();

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      logger.error({ err, url: req.url }, 'error no capturado en request');
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });
  });

  // ── Socket.IO (gestiona su propio 'upgrade' para /socket.io) ────────────────
  const io = setupSocketIO(server);

  // ── Hocuspocus en /collab ──────────────────────────────────────────────────
  const hocuspocus = getHocuspocus();
  const collabWss = new WebSocketServer({ noServer: true });
  collabWss.on('connection', (ws, req) => handleCollabConnection(ws, req));

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url ?? '');
    if (pathname === '/collab') {
      collabWss.handleUpgrade(req, socket, head, (ws) => {
        collabWss.emit('connection', ws, req);
      });
    } else if (!pathname || !pathname.startsWith('/socket.io')) {
      // Nadie más maneja este upgrade.
      socket.destroy();
    }
  });

  server.listen(env.PORT, '0.0.0.0', () => {
    const port = env.PORT;
    const urls = [`http://localhost:${port}`, ...ipsLan().map((ip) => `http://${ip}:${port}`)];
    // Producción escribe pino en logs/; esto confirma en la terminal que ya escucha.
    console.log(`${APP_NAME} listo\n${urls.map((u) => `  ${u}`).join('\n')}`);
    logger.info(`▸ Esta Mac:  http://localhost:${port}`);
    for (const ip of ipsLan()) {
      logger.info(`▸ Celular u otra PC en la misma WiFi:  http://${ip}:${port}`);
    }
    void ingestarCasilleroAlArranque();
  });

  scheduleBackups();
  scheduleResumenCorreos();
  scheduleMantenimiento();

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  let cerrando = false;
  const shutdown = async (sig: NodeJS.Signals): Promise<void> => {
    if (cerrando) return;
    cerrando = true;
    logger.info({ sig }, 'apagando…');
    server.close();
    io.close();
    try {
      await hocuspocus.destroy();
    } catch (err) {
      logger.warn({ err }, 'error al destruir Hocuspocus');
    }
    try {
      sqlite.pragma('optimize');
      sqlite.close();
    } catch (err) {
      logger.warn({ err }, 'error al cerrar SQLite');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandledRejection');
  });
}

void main().catch((err: unknown) => {
  logger.error({ err }, 'fallo al arrancar el servidor');
  process.exit(1);
});
