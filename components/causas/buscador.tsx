'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Search, Loader2, Scale, Plus, CloudDownload, ClipboardPaste, Users, ChevronRight } from 'lucide-react';
import { apiMutate, fetcher } from '@/lib/api';
import { clasificarConsultaCausa, formatearNumeroJuicio } from '@/lib/schemas/causa';
import { useRealtime } from '@/lib/realtime/socket-client';
import { esEditor, useSesion } from '@/components/shell/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormularioCausaManual } from '@/components/causas/form-manual';
import { DialogPegarNotificacion } from '@/components/causas/pegar-notificacion';
import type { ListaAgrupada } from '@/lib/clientes';

interface ResultadoSadje {
  idJuicio: string;
  numeroJuicio: string;
  estado: string;
  materia: string;
  tipoAccion: string;
  judicatura: string;
  fechaIngreso: string;
}

export function Buscador({ qInicial = '' }: { qInicial?: string }) {
  const { role } = useSesion();
  const puedeEditar = esEditor(role);
  const router = useRouter();
  const [q, setQ] = useState(qInicial);
  const [manual, setManual] = useState(false);
  const [pegar, setPegar] = useState(false);
  const jobIdRef = useRef<string | null>(null);
  const [sadjeBuscando, setSadjeBuscando] = useState(false);
  const [sadjeResultados, setSadjeResultados] = useState<ResultadoSadje[] | null>(null);
  const [sadjeError, setSadjeError] = useState<string | null>(null);

  const qTrim = q.trim();
  const consulta = clasificarConsultaCausa(qTrim);
  const { data, isLoading } = useSWR<ListaAgrupada>(
    `/api/causas?q=${encodeURIComponent(q.trim())}`,
    fetcher,
  );

  useRealtime('causas', (ev) => {
    if (ev.t === 'sadje:resultado' && ev.jobId === jobIdRef.current) {
      setSadjeBuscando(false);
      if (ev.ok && ev.data && typeof ev.data === 'object' && 'resultados' in ev.data) {
        setSadjeResultados((ev.data as { resultados: ResultadoSadje[] }).resultados);
        setSadjeError(null);
      } else if (ev.ok && ev.data && typeof ev.data === 'object' && 'causaId' in ev.data) {
        router.push(`/causas/${(ev.data as { causaId: string }).causaId}`);
      } else {
        setSadjeError(ev.error ?? 'e-SATJE no disponible');
        setSadjeResultados(null);
      }
    }
  });

  async function buscarSadje() {
    setSadjeBuscando(true);
    setSadjeError(null);
    setSadjeResultados(null);
    try {
      const body =
        consulta.tipo === 'juicio'
          ? { numeroJuicio: consulta.valor }
          : consulta.tipo === 'cedula'
            ? { cedula: consulta.valor }
            : { nombre: consulta.valor };
      const { jobId: id } = await apiMutate<{ jobId: string }>(
        '/api/causas/buscar-sadje',
        'POST',
        body,
      );
      jobIdRef.current = id;
    } catch (err) {
      setSadjeBuscando(false);
      toast.error(err instanceof Error ? err.message : 'No se pudo iniciar la búsqueda');
    }
  }

  async function importar(r: ResultadoSadje) {
    try {
      const { jobId: id } = await apiMutate<{ jobId: string }>(
        '/api/causas/importar',
        'POST',
        { resumen: r },
      );
      jobIdRef.current = id;
      toast.info('Importando causa desde e-SATJE…');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo importar');
    }
  }

  const clientes = data?.clientes ?? [];
  const sinCliente = data?.sinCliente ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Causas</h1>
        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPegar(true)}>
              <ClipboardPaste className="size-4" /> Pegar notificación
            </Button>
            <Button variant="outline" size="sm" onClick={() => setManual(true)}>
              <Plus className="size-4" /> Registrar manualmente
            </Button>
          </div>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && qTrim && puedeEditar && !sadjeBuscando) {
              e.preventDefault();
              void buscarSadje();
            }
          }}
          placeholder="Número de juicio (01204-2026-03376), cédula o nombre"
          className="h-11 pl-9 text-base"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        La caja filtra causas ya guardadas. Para e-SATJE usá el botón. Acepta número de
        juicio con o sin guiones (<span className="font-medium">01333202609535</span> o{' '}
        <span className="font-medium">01571202600963G</span>), cédula de 10 dígitos, o
        nombre y apellido. Tarda unos segundos.
      </p>

      {qTrim && puedeEditar && (
        <Button variant="secondary" size="sm" onClick={() => void buscarSadje()} disabled={sadjeBuscando}>
          {sadjeBuscando ? <Loader2 className="size-4 animate-spin" /> : <CloudDownload className="size-4" />}
          Buscar en e-SATJE{' '}
          {consulta.tipo === 'juicio'
            ? 'por número de juicio'
            : consulta.tipo === 'cedula'
              ? 'por cédula'
              : 'por nombre'}
        </Button>
      )}

      <section>
        <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Por cliente
        </h2>
        {isLoading && <p className="text-sm text-muted-foreground">Buscando…</p>}
        <ul className="divide-y rounded-lg border bg-card">
          {clientes.length === 0 && sinCliente.length === 0 && !isLoading && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              {q ? 'Sin causas locales.' : 'Todavía no hay notificaciones.'}
            </li>
          )}
          {clientes.map((cl) => (
            <li key={cl.id}>
              <Link
                href={`/causas/cliente/${cl.id}`}
                prefetch
                className="flex items-start gap-3 px-4 py-3 hover:bg-accent/40"
              >
                <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{cl.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {cl.nCausas} juicio{cl.nCausas === 1 ? '' : 's'} · {cl.nActuaciones}{' '}
                    notificación{cl.nActuaciones === 1 ? '' : 'es'}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {cl.causas.map((c) => c.numeroJuicio).join(' · ')}
                  </p>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
          {sinCliente.map((c) => (
            <li key={c.id}>
              <Link
                href={`/causas/${c.id}`}
                prefetch
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40"
              >
                <Scale className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.numeroJuicio}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.materia, 'sin cliente'].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Badge variant={c.origen === 'manual' ? 'secondary' : 'default'}>
                  {c.origen}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {(sadjeBuscando || sadjeResultados || sadjeError) && (
        <section>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Resultados e-SATJE
          </h2>
          {sadjeBuscando && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Consultando la Función Judicial…
            </p>
          )}
          {sadjeError && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="font-medium text-warning-foreground">SADJE no disponible</p>
              <p className="text-muted-foreground">{sadjeError}</p>
              {puedeEditar && (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setManual(true)}>
                  Registrar la causa manualmente
                </Button>
              )}
            </div>
          )}
          {sadjeResultados && (
            <ul className="divide-y rounded-lg border bg-card">
              {sadjeResultados.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  e-SATJE no devolvió resultados.
                </li>
              )}
              {sadjeResultados.map((r) => (
                <li key={r.idJuicio} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.numeroJuicio}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[r.materia, r.judicatura].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {puedeEditar && (
                    <Button size="sm" onClick={() => importar(r)}>
                      Importar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <FormularioCausaManual
        abierto={manual}
        onOpenChange={setManual}
        numeroInicial={
          consulta.tipo === 'juicio' ? formatearNumeroJuicio(consulta.valor) : ''
        }
      />
      <DialogPegarNotificacion abierto={pegar} onOpenChange={setPegar} />
    </div>
  );
}
