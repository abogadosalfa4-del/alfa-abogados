import { hostname, networkInterfaces } from 'node:os';

/** IPv4 de esta máquina en la WiFi/LAN (no loopback). */
export function ipsLan(): string[] {
  const ips: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) {
      const v4 = n.family === 'IPv4' || (n.family as unknown) === 4;
      if (v4 && !n.internal) ips.push(n.address);
    }
  }
  return ips;
}

/** Hosts que Next debe aceptar en `npm run dev` desde otra PC o el celular. */
export function origenesDevLan(): string[] {
  const hosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', ...ipsLan()]);
  const local = hostname().toLowerCase();
  if (local) hosts.add(local);
  return [...hosts];
}
