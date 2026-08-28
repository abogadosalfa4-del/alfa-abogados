import { hostname, networkInterfaces } from 'node:os';

function origenesDevLan() {
  const hosts = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) {
      const v4 = n.family === 'IPv4' || n.family === 4;
      if (v4 && !n.internal) hosts.add(n.address);
    }
  }
  const local = hostname().toLowerCase();
  if (local) hosts.add(local);
  return [...hosts];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // Celular / otra PC en la misma WiFi (si no, Next 15 bloquea el dev server).
  allowedDevOrigins: origenesDevLan(),
  // Paquetes nativos / de servidor que NO deben pasar por el bundler de Next.
  // yjs y Hocuspocus tienen que ser el mismo módulo: si Next embebe yjs y el
  // server.ts lo importa por ESM, aparece «Yjs was already imported» (yjs#438).
  serverExternalPackages: [
    'better-sqlite3',
    '@hocuspocus/server',
    '@hocuspocus/transformer',
    '@hocuspocus/extension-database',
    'yjs',
    'lib0',
    'y-protocols',
    'y-prosemirror',
    'pino',
    'pino-roll',
    'sqlite-vec',
    'unpdf',
    'mammoth',
  ],
  eslint: {
    // El lint corre en CI / pre-commit; no bloquea el build de la PC de oficina.
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
