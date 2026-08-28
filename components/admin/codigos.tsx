'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { BookText, Loader2, Upload } from 'lucide-react';
import { fetcher } from '@/lib/api';
import { useRealtime } from '@/lib/realtime/socket-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Codigo {
  fuenteId: string;
  titulo: string;
  chunks: number;
}

export function AdminCodigos() {
  const { data, mutate } = useSWR<{
    codigos: Codigo[];
    totales: { codigos: number; archivos: number };
  }>('/api/codigos', fetcher);
  const [titulo, setTitulo] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useRealtime('causas', (ev) => {
    if (ev.t === 'notificacion') void mutate();
  });

  async function subir(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !titulo.trim()) {
      toast.error('Indicá el nombre y elegí un PDF.');
      return;
    }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('titulo', titulo.trim());
      const res = await fetch('/api/codigos', { method: 'POST', body: fd, credentials: 'same-origin' });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'Error');
      toast.success('PDF en cola de ingestión — puede tardar unos minutos.');
      setTitulo('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-lg font-semibold">Códigos legales</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        {data ? `${data.totales.codigos} fragmentos de código · ${data.totales.archivos} de expedientes` : '…'}
      </p>

      <form onSubmit={subir} className="mb-6 space-y-3 rounded-lg border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="ct">Nombre del código</Label>
          <Input id="ct" placeholder="COGEP, Código Civil, COIP…" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf">PDF</Label>
          <Input id="cf" ref={fileRef} type="file" accept="application/pdf" />
        </div>
        <Button type="submit" size="sm" disabled={subiendo}>
          {subiendo ? <Loader2 className="animate-spin" /> : <Upload className="size-4" />}
          Subir e ingerir
        </Button>
      </form>

      <ul className="divide-y rounded-lg border bg-card">
        {(data?.codigos ?? []).length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            Todavía no hay códigos ingeridos.
          </li>
        )}
        {(data?.codigos ?? []).map((c) => (
          <li key={c.fuenteId} className="flex items-center gap-3 px-4 py-3 text-sm">
            <BookText className="size-4 text-primary" />
            <span className="flex-1">{c.titulo}</span>
            <span className="text-xs text-muted-foreground">{c.chunks} fragmentos</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
