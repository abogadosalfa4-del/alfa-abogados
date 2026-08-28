'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Scale,
  Mail,
  FolderOpen,
} from 'lucide-react';
import { apiMutate, fetcher } from '@/lib/api';
import { fechaExpediente, haceCuanto } from '@/lib/fechas';
import { useRealtime } from '@/lib/realtime/socket-client';
import { esEditor, useSesion } from '@/components/shell/providers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TIPO_META } from '@/components/calendario/meta';
import { inferirEtiqueta, textoJuicio } from '@/lib/etiquetas-evento';

interface ExpCliente {
  cliente: {
    id: string;
    nombreCompleto: string;
    cedula: string | null;
    telefono: string | null;
    email: string | null;
    notas: string | null;
    createdAt: string;
  };
  causas: {
    id: string;
    numeroJuicio: string;
    tipoAccion: string | null;
    materia: string | null;
    judicatura: string | null;
    estado: string | null;
    fechaIngreso: string | null;
    origen: 'sadje' | 'manual';
    ultimaSincronizacion: string | null;
  }[];
  partes: {
    id: string;
    causaId: string;
    tipo: string;
    nombre: string;
    representante: string | null;
    numeroJuicio: string;
  }[];
  actuaciones: {
    id: string;
    causaId: string;
    fecha: string;
    tipo: string;
    detalle: string;
    origen: string;
    numeroJuicio: string;
  }[];
  eventos: {
    id: string;
    causaId: string | null;
    tipo: 'escrito' | 'audiencia' | 'diligencia';
    fecha: string;
    titulo: string;
    estado: string;
    numeroJuicio: string | null;
  }[];
  archivos: {
    id: string;
    causaId: string;
    nombreOriginal: string;
    mime: string;
    tamano: number;
    createdAt: string;
    indexadoRag: boolean;
    numeroJuicio: string;
  }[];
  correos: {
    id: string;
    causaId: string | null;
    asunto: string | null;
    receivedAt: string | null;
    estado: string;
    numeroJuicio: string | null;
  }[];
}

export function ExpedienteCliente({
  id,
  causaId = null,
}: {
  id: string;
  causaId?: string | null;
}) {
  const { role } = useSesion();
  const puedeEditar = esEditor(role);
  const { data, isLoading, mutate } = useSWR<ExpCliente>(`/api/clientes/${id}`, fetcher);
  const [sincronizando, setSincronizando] = useState(false);
  const idsCausas = useMemo(() => new Set(data?.causas.map((c) => c.id) ?? []), [data]);

  useEffect(() => {
    if (!puedeEditar) return;
    let cancel = false;
    void (async () => {
      try {
        await apiMutate(`/api/clientes/${id}/sincronizar`, 'POST');
        if (!cancel) setSincronizando(true);
      } catch {
        /* e-SATJE opcional: el expediente de casillero ya está */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [id, puedeEditar]);

  useEffect(() => {
    if (!puedeEditar || !causaId) return;
    setSincronizando(true);
    void apiMutate(`/api/causas/${causaId}/sincronizar?forzar=1`, 'POST').catch(() => {
      setSincronizando(false);
    });
  }, [causaId, puedeEditar]);

  useRealtime('causas', (ev) => {
    if (ev.t === 'causa:sincronizada' && idsCausas.has(ev.causaId)) {
      void mutate();
    }
    if (ev.t === 'sadje:resultado' && idsCausas.has(ev.jobId)) {
      setSincronizando(false);
      if (ev.ok) toast.success('e-SATJE actualizó el expediente');
      else toast.message(ev.error ?? 'e-SATJE no publicó más datos de esta causa');
      void mutate();
    }
  });

  async function sincronizar() {
    setSincronizando(true);
    try {
      await apiMutate(`/api/clientes/${id}/sincronizar`, 'POST');
      toast.info('Consultando e-SATJE en segundo plano…');
    } catch (err) {
      setSincronizando(false);
      toast.error(err instanceof Error ? err.message : 'No se pudo sincronizar');
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Cargando cliente…
      </div>
    );
  }
  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">Cliente no encontrado.</div>;
  }

  const { cliente } = data;
  const causaFoco = causaId ? data.causas.find((c) => c.id === causaId) : undefined;
  const actuacionesFoco = causaId
    ? data.actuaciones.filter((a) => a.causaId === causaId)
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/causas" aria-label="Volver">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">{cliente.nombreCompleto}</h1>
          <p className="text-sm text-muted-foreground">
            {data.causas.length} juicio{data.causas.length === 1 ? '' : 's'} ·{' '}
            {data.actuaciones.length} actuación{data.actuaciones.length === 1 ? '' : 'es'}
            {cliente.cedula ? ` · CI ${cliente.cedula}` : ''}
          </p>
        </div>
        {puedeEditar && (
          <Button variant="outline" size="sm" onClick={() => void sincronizar()} disabled={sincronizando}>
            {sincronizando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {sincronizando ? 'Consultando e-SATJE…' : 'Sincronizar e-SATJE'}
          </Button>
        )}
      </div>

      {sincronizando && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Buscando en e-SATJE más datos de {cliente.nombreCompleto}…
        </p>
      )}

      {causaFoco && (
        <section
          id="juicio-foco"
          className="space-y-3 rounded-lg border-2 border-primary/30 bg-card p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary">Juicio del calendario</p>
              <h2 className="text-base font-semibold tabular-nums">{causaFoco.numeroJuicio}</h2>
              <p className="text-sm text-muted-foreground">
                {[causaFoco.materia, causaFoco.judicatura, causaFoco.estado]
                  .filter(Boolean)
                  .join(' · ') || 'Sin materia ni juzgado publicados'}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/causas/${causaFoco.id}`}>
                <Scale className="size-4" />
                Expediente e-SATJE
              </Link>
            </Button>
          </div>
          {actuacionesFoco.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay actuaciones de este juicio. e-SATJE se consulta en segundo plano.
            </p>
          ) : (
            <ol className="space-y-2">
              {actuacionesFoco.map((a) => (
                <li key={a.id} className="rounded-md border bg-background p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{a.tipo}</Badge>
                    <span>{fechaExpediente(a.fecha) || a.fecha}</span>
                    <span>{a.origen === 'correo' ? 'casillero' : a.origen}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.detalle}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <Tabs defaultValue="todo">
        <TabsList>
          <TabsTrigger value="todo">Todo ({data.actuaciones.length})</TabsTrigger>
          <TabsTrigger value="juicios">Juicios ({data.causas.length})</TabsTrigger>
          <TabsTrigger value="correos">Casillero ({data.correos.length})</TabsTrigger>
          <TabsTrigger value="fechas">Fechas ({data.eventos.length})</TabsTrigger>
          <TabsTrigger value="archivos">Archivos ({data.archivos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="todo" className="space-y-2">
          {data.actuaciones.length === 0 && (
            <p className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              Todavía no hay notificaciones de este cliente.
            </p>
          )}
          <ol className="space-y-2">
            {data.actuaciones.map((a) => (
              <li key={a.id} className="rounded-lg border bg-card p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{a.tipo}</Badge>
                  <span>{fechaExpediente(a.fecha) || a.fecha}</span>
                  <Link href={`/causas/${a.causaId}`} className="hover:underline">
                    {a.numeroJuicio}
                  </Link>
                  <span>{a.origen === 'correo' ? 'casillero' : a.origen}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.detalle}</p>
              </li>
            ))}
          </ol>
        </TabsContent>

        <TabsContent value="juicios">
          <ul className="divide-y rounded-lg border bg-card">
            {data.causas.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/causas/${c.id}`}
                  className={
                    c.id === causaId
                      ? 'flex items-center gap-3 bg-primary/10 px-4 py-3 hover:bg-primary/15'
                      : 'flex items-center gap-3 px-4 py-3 hover:bg-accent/40'
                  }
                >
                  <Scale className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.numeroJuicio}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[c.materia, c.judicatura, c.estado].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Badge variant={c.origen === 'manual' ? 'secondary' : 'default'}>{c.origen}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="correos">
          <ul className="divide-y rounded-lg border bg-card">
            {data.correos.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Sin correos de casillero vinculados.
              </li>
            )}
            {data.correos.map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m.asunto ?? '(sin asunto)'}</p>
                  <p className="text-xs text-muted-foreground">
                    {[m.numeroJuicio, m.receivedAt ? haceCuanto(m.receivedAt) : null, m.estado]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="fechas">
          <ul className="divide-y rounded-lg border bg-card">
            {data.eventos.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Sin plazos ni audiencias.
              </li>
            )}
            {data.eventos.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: TIPO_META[e.tipo].color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {inferirEtiqueta(e.titulo, e.tipo as 'escrito' | 'audiencia' | 'diligencia')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      fechaExpediente(e.fecha) || e.fecha,
                      textoJuicio(e.numeroJuicio),
                      e.estado,
                    ].join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="archivos">
          <ul className="divide-y rounded-lg border bg-card">
            {data.archivos.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Sin archivos. Abrí un juicio para subir.
              </li>
            )}
            {data.archivos.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.nombreOriginal}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.numeroJuicio} · {haceCuanto(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}
