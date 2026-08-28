'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { toast } from 'sonner';
import { FileText, Plus, Loader2 } from 'lucide-react';
import { apiMutate, fetcher } from '@/lib/api';
import { haceCuanto } from '@/lib/fechas';
import { useRealtime } from '@/lib/realtime/socket-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DocumentoDTO } from '@/lib/documentos';

const ESTADO: Record<DocumentoDTO['estado'], { label: string; variant: 'secondary' | 'warning' | 'default' }> = {
  borrador: { label: 'Borrador', variant: 'secondary' },
  enviado: { label: 'En revisión', variant: 'warning' },
  aprobado: { label: 'Aprobado', variant: 'default' },
};

export function ListaDocumentos({ puedeCrear }: { puedeCrear: boolean }) {
  const router = useRouter();
  const { data, mutate } = useSWR<{ documentos: DocumentoDTO[] }>(
    '/api/documentos',
    fetcher,
  );
  const [nuevo, setNuevo] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [creando, setCreando] = useState(false);

  useRealtime(['tareas'], (ev) => {
    if (ev.t === 'documento:enviado') void mutate();
  });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    try {
      const { documento } = await apiMutate<{ documento: DocumentoDTO }>(
        '/api/documentos',
        'POST',
        { titulo: titulo.trim() },
      );
      router.push(`/documentos/${documento.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear');
      setCreando(false);
    }
  }

  const docs = data?.documentos ?? [];

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Documentos</h1>
        {puedeCrear && (
          <Button size="sm" onClick={() => setNuevo(true)}>
            <Plus className="size-4" /> Nuevo documento
          </Button>
        )}
      </div>

      <ul className="divide-y rounded-lg border bg-card">
        {docs.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            Todavía no hay documentos.
          </li>
        )}
        {docs.map((d) => (
          <li key={d.id}>
            <Link
              href={`/documentos/${d.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {[d.creadorNombre, d.causaNumero].filter(Boolean).join(' · ')}
                  {' · '}
                  {haceCuanto(d.updatedAt)}
                </p>
              </div>
              <Badge variant={ESTADO[d.estado].variant}>
                {ESTADO[d.estado].label}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>

      <Dialog open={nuevo} onOpenChange={setNuevo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo documento</DialogTitle>
          </DialogHeader>
          <form onSubmit={crear} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doc-titulo">Título</Label>
              <Input
                id="doc-titulo"
                autoFocus
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej. Demanda de alimentos — Pérez"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setNuevo(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creando}>
                {creando && <Loader2 className="animate-spin" />}
                Crear y abrir
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
