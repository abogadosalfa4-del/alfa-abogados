'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { fetcher } from '@/lib/api';
import type { ItemSalud } from '@/lib/salud';

export function EstadoDashboard() {
  const { data } = useSWR<{ items: ItemSalud[] }>('/api/admin/salud', fetcher);

  if (!data) return null;

  return (
    <section className="mb-6 space-y-3">
      <h2 className="text-sm font-medium">Estado de configuración</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {data.items.map((item) => {
          const inner = (
            <div className="flex gap-2 rounded-lg border bg-card p-3">
              {item.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.titulo}</p>
                <p className="text-xs text-muted-foreground">{item.detalle}</p>
              </div>
            </div>
          );
          return (
            <li key={item.id}>
              {item.href ? (
                <Link href={item.href} className="block hover:bg-accent/20">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
