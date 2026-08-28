'use client';

import { useEffect, useState } from 'react';
import useSWR, { mutate as mutateSWR } from 'swr';
import Link from 'next/link';
import { Mail, MailOpen, Loader2 } from 'lucide-react';
import { apiMutate, fetcher } from '@/lib/api';
import { formatoLocal, haceCuanto } from '@/lib/fechas';
import {
  esFalloSistema,
  textoCliente,
  textoClienteCorto,
  textoJuicio,
  textoJuicioCorto,
  textoJuzgado,
} from '@/lib/etiquetas-evento';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  CorreoCasilleroDetalle,
  CorreoCasilleroLista,
} from '@/lib/outlook/casillero';

export const KEY_CORREOS_CASILLERO = '/api/correos/casillero';

export function ListaCasillero({ autoImport }: { autoImport: boolean }) {
  const { data, isLoading } = useSWR<{
    correos: CorreoCasilleroLista[];
    noLeidos: number;
  }>(KEY_CORREOS_CASILLERO, fetcher, { revalidateOnFocus: true });
  const [abierto, setAbierto] = useState<CorreoCasilleroDetalle | null>(null);
  const [cargandoId, setCargandoId] = useState<string | null>(null);

  useEffect(() => {
    if (!autoImport) return;
    let cancel = false;
    void (async () => {
      try {
        await apiMutate(KEY_CORREOS_CASILLERO, 'POST');
      } catch {
        /* worker o red caídos: la bandeja local igual se muestra */
      }
      if (!cancel) void mutateSWR(KEY_CORREOS_CASILLERO);
    })();
    return () => {
      cancel = true;
    };
  }, [autoImport]);

  async function abrir(id: string) {
    setCargandoId(id);
    try {
      const { correo } = await fetcher<{ correo: CorreoCasilleroDetalle }>(
        `/api/correos/casillero/${id}`,
      );
      setAbierto(correo);
      void mutateSWR(KEY_CORREOS_CASILLERO);
    } finally {
      setCargandoId(null);
    }
  }

  const correos = data?.correos ?? [];
  const noLeidos = data?.noLeidos ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">Correos</h1>
          <p className="text-xs text-muted-foreground">
            Guardados en este equipo. Siguen visibles si el servidor estuvo apagado.
          </p>
        </div>
        {noLeidos > 0 && (
          <Badge>{noLeidos} sin leer</Badge>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading && !data && (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando bandeja…
          </p>
        )}
        {!isLoading && correos.length === 0 && (
          <p className="px-4 py-16 text-center text-sm text-muted-foreground">
            No hay correos del casillero. Los que lleguen con la app apagada se
            guardan y aparecen al prender o al importar.
          </p>
        )}
        <ul className="divide-y">
          {correos.map((c) => {
            const sinLeer = !c.leido;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void abrir(c.id)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/50',
                    sinLeer && 'bg-primary/5',
                    cargandoId === c.id && 'opacity-70',
                  )}
                >
                  {sinLeer ? (
                    <Mail className="mt-0.5 size-4 shrink-0 text-primary" />
                  ) : (
                    <MailOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      sinLeer ? 'bg-primary' : 'bg-transparent',
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p
                        className={cn(
                          'truncate text-sm',
                          sinLeer ? 'font-semibold' : 'font-medium text-muted-foreground',
                        )}
                      >
                        {c.asunto ?? '(sin asunto)'}
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {fechaCorreo(c.receivedAt)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.remitente || 'Función Judicial'}
                      {' · '}
                      {textoJuicioCorto(c.numeroJuicio)}
                      {' · '}
                      {textoClienteCorto(c.clienteNombre)}
                    </p>
                    {c.preview && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {c.preview}
                      </p>
                    )}
                    {c.estado === 'error' && c.error && (
                      <p className="mt-1 text-xs text-destructive">{c.error}</p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <Dialog open={Boolean(abierto)} onOpenChange={(o) => !o && setAbierto(null)}>
        {abierto && (
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{abierto.asunto ?? '(sin asunto)'}</DialogTitle>
              <DialogDescription>
                {abierto.remitente || 'Función Judicial'}
                {abierto.receivedAt ? ` · ${fechaCorreoLarga(abierto.receivedAt)}` : ''}
              </DialogDescription>
            </DialogHeader>
            <dl className="space-y-2 text-sm">
              <Fila
                nombre="Juicio"
                valor={textoJuicio(abierto.numeroJuicio)}
                fallo={esFalloSistema(textoJuicio(abierto.numeroJuicio))}
              />
              <Fila
                nombre="Cliente"
                valor={textoCliente(abierto.clienteNombre)}
                fallo={esFalloSistema(textoCliente(abierto.clienteNombre))}
              />
              <Fila
                nombre="Juzgado"
                valor={textoJuzgado(abierto.judicatura)}
                fallo={esFalloSistema(textoJuzgado(abierto.judicatura))}
              />
              {abierto.causaId && (
                <div className="grid grid-cols-[7rem_1fr] gap-2">
                  <dt className="text-muted-foreground">Expediente</dt>
                  <dd>
                    <Link
                      href={`/causas/${abierto.causaId}`}
                      className="text-primary hover:underline"
                    >
                      Abrir juicio
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
              {abierto.cuerpo?.trim() || 'SIN CUERPO — error del sistema'}
            </pre>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Fila({
  nombre,
  valor,
  fallo,
}: {
  nombre: string;
  valor: string;
  fallo?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <dt className="text-muted-foreground">{nombre}</dt>
      <dd className={fallo ? 'font-medium text-destructive' : undefined}>{valor}</dd>
    </div>
  );
}

function fechaCorreo(iso: string | null): string {
  if (!iso) return '';
  try {
    if (/^\d{4}-\d{2}-\d{2}T/.test(iso) || iso.includes('Z')) return haceCuanto(iso);
    return iso;
  } catch {
    return iso;
  }
}

function fechaCorreoLarga(iso: string): string {
  try {
    if (/^\d{4}-\d{2}-\d{2}T/.test(iso) || iso.includes('Z') || iso.includes('+')) {
      return formatoLocal(iso);
    }
    return iso;
  } catch {
    return iso;
  }
}
