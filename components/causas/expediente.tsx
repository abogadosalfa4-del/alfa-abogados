'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { toast } from 'sonner';
import { RefreshCw, Loader2, ArrowLeft, Plus, ClipboardPaste } from 'lucide-react';
import { apiMutate, fetcher } from '@/lib/api';
import { fechaExpediente, haceCuanto, hoyISO } from '@/lib/fechas';
import { parsearNotificacion } from '@/lib/extraer-fecha';
import { useRealtime } from '@/lib/realtime/socket-client';
import { esEditor, useSesion } from '@/components/shell/providers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SubirArchivo } from '@/components/causas/subir-archivo';
import { TIPO_META } from '@/components/calendario/meta';
import { inferirEtiqueta } from '@/lib/etiquetas-evento';

interface Expediente {
  causa: {
    id: string;
    numeroJuicio: string;
    clienteId: string | null;
    clienteNombre: string | null;
    tipoAccion: string | null;
    materia: string | null;
    judicatura: string | null;
    estado: string | null;
    fechaIngreso: string | null;
    origen: 'sadje' | 'manual';
    ultimaSincronizacion: string | null;
  };
  partes: { id: string; tipo: string; nombre: string; representante: string | null }[];
  actuaciones: { id: string; fecha: string; tipo: string; detalle: string; origen: string }[];
  eventos: { id: string; tipo: 'escrito' | 'audiencia' | 'diligencia'; fecha: string; titulo: string; estado: string }[];
  archivos: { id: string; nombreOriginal: string; mime: string; tamano: number; createdAt: string; indexadoRag: boolean }[];
}

export function ExpedienteCausa({ id }: { id: string }) {
  const { role } = useSesion();
  const puedeEditar = esEditor(role);
  const { data, isLoading, mutate } = useSWR<Expediente>(`/api/causas/${id}`, fetcher);
  const [sincronizando, setSincronizando] = useState(false);
  const [nuevaAct, setNuevaAct] = useState(false);
  const [tab, setTab] = useState('resumen');

  const [progresoRag, setProgresoRag] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!puedeEditar) return;
    let cancel = false;
    void (async () => {
      try {
        await apiMutate(`/api/causas/${id}/sincronizar`, 'POST');
        if (!cancel) setSincronizando(true);
      } catch {
        /* e-SATJE opcional */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [id, puedeEditar]);

  useRealtime('causas', (ev) => {
    if (ev.t === 'causa:sincronizada' && ev.causaId === id) void mutate();
    if (ev.t === 'sadje:resultado' && ev.jobId === id) {
      setSincronizando(false);
      if (ev.ok) {
        const n =
          ev.data && typeof ev.data === 'object' && 'nuevasActuaciones' in ev.data
            ? Number((ev.data as { nuevasActuaciones: number }).nuevasActuaciones)
            : null;
        if (n === 0) {
          toast.message(
            'e-SATJE no publicó actuaciones de esta causa. Pegá el texto del casillero electrónico.',
          );
        } else {
          toast.success('Causa sincronizada con e-SATJE');
        }
      } else toast.warning(ev.error ?? 'e-SATJE no disponible');
      void mutate();
    }
    if (ev.t === 'rag:progreso') {
      setProgresoRag((p) => ({ ...p, [ev.archivoId]: ev.pct }));
      if (ev.pct >= 100) void mutate();
    }
  });

  async function indexar(archivoId: string) {
    try {
      await apiMutate(`/api/archivos/${archivoId}/indexar`, 'POST');
      toast.info('Archivo en cola para el asistente IA…');
      setProgresoRag((p) => ({ ...p, [archivoId]: 1 }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo indexar');
    }
  }

  async function sincronizar() {
    setSincronizando(true);
    try {
      await apiMutate(`/api/causas/${id}/sincronizar?forzar=1`, 'POST');
      toast.info('Sincronizando con e-SATJE…');
    } catch (err) {
      setSincronizando(false);
      toast.error(err instanceof Error ? err.message : 'No se pudo sincronizar');
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Cargando expediente…
      </div>
    );
  }
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Causa no encontrada.</div>;

  const { causa } = data;
  const sinExpedientePublico =
    causa.origen === 'sadje' && data.actuaciones.length === 0 && data.partes.length === 0;

  function abrirPegarNotificacion() {
    setTab('actuaciones');
    setNuevaAct(true);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={causa.clienteId ? `/causas/cliente/${causa.clienteId}` : '/causas'} aria-label="Volver"><ArrowLeft className="size-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{causa.numeroJuicio}</h1>
          <p className="text-sm text-muted-foreground">
            {causa.clienteId ? (
              <Link href={`/causas/cliente/${causa.clienteId}`} className="hover:underline">
                {causa.clienteNombre}
              </Link>
            ) : (
              causa.clienteNombre
            )}
            {causa.materia || causa.judicatura
              ? ` · ${[causa.materia, causa.judicatura].filter(Boolean).join(' · ')}`
              : ''}
          </p>
        </div>
        <Badge variant={causa.origen === 'manual' ? 'secondary' : 'default'}>{causa.origen}</Badge>
        {puedeEditar && (
          <Button variant="outline" size="sm" onClick={sincronizar} disabled={sincronizando}>
            {sincronizando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Sincronizar ahora
          </Button>
        )}
      </div>
      {causa.ultimaSincronizacion && (
        <p className="text-xs text-muted-foreground">
          Última sincronización: {haceCuanto(causa.ultimaSincronizacion)}
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="actuaciones">Actuaciones ({data.actuaciones.length})</TabsTrigger>
          <TabsTrigger value="archivos">Archivos ({data.archivos.length})</TabsTrigger>
          <TabsTrigger value="fechas">Fechas ({data.eventos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-4">
          {sinExpedientePublico && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <p className="font-medium">e-SATJE no publica el expediente de esta causa</p>
              <p className="mt-1 text-muted-foreground">
                En violencia y medidas de protección el portal suele ocultar partes, actuaciones y
                judicatura. El texto de la notificación llega por el casillero electrónico: pegalo
                acá para que quede en el expediente y se arme el plazo o la audiencia.
              </p>
              {puedeEditar && (
                <Button size="sm" className="mt-3" onClick={abrirPegarNotificacion}>
                  <ClipboardPaste className="size-4" /> Pegar notificación
                </Button>
              )}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 text-sm">
            <Campo k="Estado" v={causa.estado} />
            <Campo k="Tipo de acción" v={causa.tipoAccion} />
            <Campo k="Fecha de ingreso" v={fechaExpediente(causa.fechaIngreso) || causa.fechaIngreso} />
            <Campo k="Judicatura" v={causa.judicatura} />
          </dl>
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Partes procesales</h3>
            <ul className="space-y-1 text-sm">
              {data.partes.length === 0 && <li className="text-muted-foreground">Sin partes registradas.</li>}
              {data.partes.map((p) => (
                <li key={p.id}>
                  <span className="capitalize text-muted-foreground">{p.tipo}:</span> {p.nombre}
                  {p.representante && <span className="text-muted-foreground"> (rep. {p.representante})</span>}
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="actuaciones">
          {puedeEditar && (
            <div className="mb-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setNuevaAct(true)}>
                <Plus className="size-4" /> Agregar actuación
              </Button>
              <Button variant="outline" size="sm" onClick={() => setNuevaAct(true)}>
                <ClipboardPaste className="size-4" /> Pegar notificación
              </Button>
            </div>
          )}
          <ol className="space-y-2">
            {data.actuaciones.length === 0 && (
              <li className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                {sinExpedientePublico
                  ? 'No hay actuaciones públicas en e-SATJE. Pegá el texto de la notificación del casillero.'
                  : 'Sin actuaciones.'}
              </li>
            )}
            {data.actuaciones.map((a) => (
              <li key={a.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{a.fecha}</span>
                  <Badge variant="outline">{a.origen}</Badge>
                </div>
                <p className="text-sm font-medium">{a.tipo}</p>
                <p className="text-sm text-muted-foreground">{a.detalle}</p>
              </li>
            ))}
          </ol>
        </TabsContent>

        <TabsContent value="archivos" className="space-y-3">
          {puedeEditar && <SubirArchivo causaId={id} onSubido={() => mutate()} />}
          <ul className="divide-y rounded-lg border bg-card">
            {data.archivos.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">Sin archivos.</li>
            )}
            {data.archivos.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <a href={`/api/archivos/${f.id}`} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">
                  {f.nombreOriginal}
                </a>
                <span className="text-xs text-muted-foreground">{(f.tamano / 1024).toFixed(0)} KB</span>
                {f.indexadoRag ? (
                  <Badge variant="outline">en IA</Badge>
                ) : progresoRag[f.id] != null && progresoRag[f.id]! < 100 ? (
                  <span className="text-xs text-muted-foreground">{progresoRag[f.id]}%</span>
                ) : puedeEditar ? (
                  <Button variant="ghost" size="sm" onClick={() => indexar(f.id)}>
                    Usar en IA
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="fechas">
          <ul className="space-y-2">
            {data.eventos.length === 0 && (
              <li className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                Sin eventos ni plazos vinculados.
              </li>
            )}
            {data.eventos.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: TIPO_META[e.tipo].color }} />
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{e.fecha}</span>
                <span className="flex-1 truncate font-medium">
                  {inferirEtiqueta(e.titulo, e.tipo)}
                </span>
                <Badge variant={e.estado === 'cancelado' ? 'destructive' : 'secondary'}>{e.estado}</Badge>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>

      <DialogActuacion
        abierto={nuevaAct}
        onOpenChange={setNuevaAct}
        causaId={id}
        onGuardado={() => mutate()}
      />
    </div>
  );
}

function Campo({ k, v }: { k: string; v: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd>{v || '—'}</dd>
    </div>
  );
}

function DialogActuacion({
  abierto,
  onOpenChange,
  causaId,
  onGuardado,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  causaId: string;
  onGuardado: () => void;
}) {
  const [fecha, setFecha] = useState('');
  const [tipo, setTipo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      const { resultado } = await apiMutate<{ resultado: { eventosGenerados: number } }>(
        `/api/causas/${causaId}/actuaciones`,
        'POST',
        { fecha, tipo: tipo.trim(), detalle: detalle.trim() },
      );
      toast.success(
        resultado.eventosGenerados > 0
          ? `Actuación agregada — se generaron ${resultado.eventosGenerados} plazo(s)`
          : 'Actuación agregada',
      );
      setFecha('');
      setTipo('');
      setDetalle('');
      onOpenChange(false);
      onGuardado();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo agregar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar actuación</DialogTitle>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Pegá el texto completo de la notificación del casillero en Detalle: se rellenan fecha y tipo.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="af">Fecha</Label>
              <Input id="af" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="at">Tipo</Label>
              <Input id="at" required placeholder="CITACIÓN, SENTENCIA…" value={tipo} onChange={(e) => setTipo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad">Detalle</Label>
            <Textarea
              id="ad"
              required
              className="min-h-[180px]"
              placeholder="Ctrl+V la notificación…"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              onPaste={(e) => {
                const raw = e.clipboardData.getData('text');
                if (raw.trim().length > 40) {
                  const p = parsearNotificacion(raw);
                  if (p.tipo) setTipo(p.tipo);
                  setFecha(p.fecha || hoyISO());
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="animate-spin" />} Agregar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
