/**
 * PM2 (PLAN §0 / §14). Arranque automático en la PC del secretario:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   npx pm2-windows-startup install     (Windows)
 *
 * El servidor custom (Next + Socket.IO + Hocuspocus) se ejecuta con tsx.
 */
const { resolve } = require('node:path');

module.exports = {
  apps: [
    {
      name: 'alfa-abogados',
      script: resolve(__dirname, 'node_modules/tsx/dist/cli.mjs'),
      args: 'server.ts',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 200,
      kill_timeout: 8000, // margen para el graceful shutdown (Hocuspocus + SQLite)
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
