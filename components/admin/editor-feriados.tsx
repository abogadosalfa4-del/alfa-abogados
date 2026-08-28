'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { apiMutate, fetcher } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Feriado {
  fecha: string;
  nombre: string;
}

export function EditorFeriados() {
  const { data, mutate } = useSWR<{ feriados: Feriado[] }>('/api/admin/feriados', fetcher);
  const [fecha, setFecha] = useState('');
  const [nombre, setNombre] = useState('');

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiMutate('/api/admin/feriados', 'POST', { fecha, nombre: nombre.trim() });
      setFecha('');
      setNombre('');
      void mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function borrar(f: string) {
    await fetch(`/api/admin/feriados?fecha=${f}`, { method: 'DELETE', credentials: 'same-origin' });
    void mutate();
  }

  async function reseed() {
    const res = await fetch('/api/admin/feriados', {
      method: 'POST',
      headers: { 'X-Seed': '1' },
      credentials: 'same-origin',
    });
    const j = await res.json();
    toast.success(`Feriados por defecto: ${j.insertados} nuevos`);
    void mutate();
  }

  const porAnio = new Map<string, Feriado[]>();
  for (const f of data?.feriados ?? []) {
    const y = f.fecha.slice(0, 4);
    porAnio.set(y, [...(porAnio.get(y) ?? []), f]);
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Feriados</h1>
        <Button variant="outline" size="sm" onClick={reseed}>Restaurar defaults</Button>
      </div>

      <form onSubmit={agregar} className="mb-4 flex items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Fecha</label>
          <Input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9" />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">Nombre</label>
          <Input required value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-9" />
        </div>
        <Button type="submit" size="sm"><Plus className="size-4" /> Agregar</Button>
      </form>

      {[...porAnio.keys()].sort().map((y) => (
        <div key={y} className="mb-4">
          <h2 className="mb-1 text-sm font-semibold">{y}</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {porAnio.get(y)!.map((f) => (
              <li key={f.fecha} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-28 tabular-nums text-muted-foreground">{f.fecha}</span>
                <span className="flex-1">{f.nombre}</span>
                <Button variant="ghost" size="icon" onClick={() => borrar(f.fecha)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
