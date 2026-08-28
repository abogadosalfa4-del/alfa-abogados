'use client';

import { useEffect, useState } from 'react';
import useSWR, { mutate as mutateSWR } from 'swr';
import { toast } from 'sonner';
import {
  Mail,
  RefreshCw,
  Loader2,
  ChevronRight,
  CalendarPlus,
  ExternalLink,
} from 'lucide-react';
import { apiMutate, fetcher } from '@/lib/api';
import { hoyISO } from '@/lib/fechas';
import { inferirEtiqueta } from '@/lib/etiquetas-evento';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DialogEvento } from '@/components/calendario/dialog-evento';
import { ListaCasillero, KEY_CORREOS_CASILLERO } from '@/components/correos/lista-casillero';
import type { EventoBorrador } from '@/lib/outlook/clasificador';

interface EstadoGraph {
  configurado: boolean;
  conectado: boolean;
  pendiente: { userCode: string; verificationUri: string; mensaje: string } | null;
}
interface EstadoOutbite {
  configurado: boolean;
  direccion: string;
  workerUrl: string | null;
}
interface EstadoImap {
  conectado: boolean;
  usuario: string | null;
  host: string | null;
}
interface Correo {
  asunto: string;
  remitente: string;
  resumen_1_linea: string;
  requiere_accion: boolean;
  numero_juicio?: string;
}
interface Resumen {
  grupos: { categoria: string; cantidad: number; correos: Correo[] }[];
}

export function PanelCorreos({ puedeConfigurar }: { puedeConfigurar: boolean }) {
  const { data: outbite, mutate: mOutbite } = useSWR<EstadoOutbite>(
    '/api/correos/outbite',
    fetcher,
  );
  const { data: imap, mutate: mImap } = useSWR<EstadoImap>('/api/correos/imap', fetcher);
  const { data: graph } = useSWR<EstadoGraph>('/api/correos/graph', fetcher, {
    refreshInterval: (d) => (d?.pendiente ? 3000 : 0),
  });
  const [borrador, setBorrador] = useState<EventoBorrador | null>(null);

  return (
    <>
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <section className="min-h-0 min-w-0 flex-1 overflow-hidden border-b lg:border-b-0 lg:border-r">
          <ListaCasillero autoImport={Boolean(outbite?.configurado)} />
        </section>
        <aside className="w-full shrink-0 space-y-6 overflow-auto p-4 lg:w-[22rem]">
          {!outbite ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Cargando configuración…
            </p>
          ) : outbite.configurado ? (
            <CasilleroOutbite direccion={outbite.direccion} />
          ) : (
            <WizardOutbite puedeConfigurar={puedeConfigurar} onListo={() => void mOutbite()} />
          )}

          {graph?.conectado ? (
            <ResumenConectado onCrearEvento={setBorrador} />
          ) : null}

          {!outbite?.configurado && (
            <details className="rounded-lg border bg-card p-4 text-sm">
              <summary className="cursor-pointer font-medium text-muted-foreground">
                Alternativa Gmail (no hace falta si usás outbite.app)
              </summary>
              <div className="mt-4">
                {imap?.conectado ? (
                  <CasilleroConectado
                    usuario={imap.usuario ?? ''}
                    puedeConfigurar={puedeConfigurar}
                    onCambio={() => void mImap()}
                  />
                ) : (
                  <WizardImap
                    puedeConfigurar={puedeConfigurar}
                    onListo={() => void mImap()}
                  />
                )}
              </div>
            </details>
          )}
        </aside>
      </div>
      {borrador && (
        <DialogEvento
          modo={{ tipo: 'crear', fecha: borrador.fecha, borrador }}
          onOpenChange={(a) => !a && setBorrador(null)}
          puedeEditar
          onCambio={() => setBorrador(null)}
          onSolicitarEdicion={() => undefined}
        />
      )}
    </>
  );
}

function WizardOutbite({
  puedeConfigurar,
  onListo,
}: {
  puedeConfigurar: boolean;
  onListo: () => void;
}) {
  const [workerUrl, setWorkerUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await apiMutate('/api/correos/outbite', 'POST', { workerUrl, secret });
      toast.success('casillero@outbite.app conectado');
      onListo();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo conectar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center gap-2">
        <Mail className="size-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Casillero en outbite.app</h1>
        <Badge variant="secondary">sin Gmail</Badge>
      </div>
      <p className="text-muted-foreground">
        El correo del sistema es{' '}
        <span className="font-medium text-foreground">casillero@outbite.app</span>.
        Hotmail reenvía ahí; la app lo lee. No se usa Calórico ni Azure.
      </p>
      <ol className="list-decimal space-y-3 pl-5 text-muted-foreground">
        <li>
          En Cloudflare, dominio <span className="font-medium text-foreground">outbite.app</span>:{' '}
          <a
            href="https://dash.cloudflare.com/?to=/:account/email-service/routing"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Email Routing <ExternalLink className="size-3" />
          </a>
          . Onboard Domain → outbite.app (deja que agregue los MX).
        </li>
        <li>
          Routing Rules → Create: patrón <code>casillero</code> @ outbite.app → Action{' '}
          <span className="font-medium text-foreground">Send to a Worker</span> →{' '}
          <code>despacho-casillero</code>.
        </li>
        <li>
          En Hotmail, regla: si el remitente incluye <code>funcionjudicial.gob.ec</code>,
          reenviar a <code>casillero@outbite.app</code>.
        </li>
        <li>Pegá abajo la URL del Worker (https://despacho-casillero.…workers.dev) y el secreto.</li>
      </ol>
      {puedeConfigurar ? (
        <form onSubmit={guardar} className="space-y-3 rounded-lg border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="wurl">URL del Worker</Label>
            <Input
              id="wurl"
              required
              placeholder="https://despacho-casillero.….workers.dev"
              value={workerUrl}
              onChange={(e) => setWorkerUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wsec">Secreto</Label>
            <Input
              id="wsec"
              type="password"
              required
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={guardando}>
            {guardando && <Loader2 className="animate-spin" />} Probar y guardar
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground">Pedile a un administrador que complete este paso.</p>
      )}
    </div>
  );
}

function CasilleroOutbite({ direccion }: { direccion: string }) {
  const [importando, setImportando] = useState(false);

  async function importar() {
    setImportando(true);
    try {
      const { resultado } = await apiMutate<{
        resultado: { leidos: number; casillero: number; ingresados: number; errores: number };
      }>('/api/correos/casillero', 'POST');
      toast.success(
        resultado.ingresados > 0
          ? `${resultado.ingresados} notificación(es) del casillero en el expediente`
          : `Sin notificaciones nuevas (${resultado.leidos} correos leídos)`,
      );
      void mutateSWR(KEY_CORREOS_CASILLERO);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo importar el casillero');
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Casillero automático</h2>
        <p className="text-xs text-muted-foreground">
          {direccion}
          {' · '}cada 15 min con la app abierta
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => void importar()} disabled={importando}>
        {importando ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
        Importar ahora
      </Button>
    </div>
  );
}

function WizardImap({
  puedeConfigurar,
  onListo,
}: {
  puedeConfigurar: boolean;
  onListo: () => void;
}) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await apiMutate('/api/correos/imap', 'POST', {
        usuario: usuario.trim(),
        password,
      });
      toast.success('Gmail conectado. Ya se pueden importar las notificaciones.');
      onListo();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo conectar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center gap-2">
        <Mail className="size-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Casillero automático</h1>
        <Badge variant="secondary">Gmail, sin Azure</Badge>
      </div>
      <p className="text-muted-foreground">
        Función Judicial sigue mandando a Hotmail. Vos reenviás solo esos mails a un
        Gmail, y esta app los lee cada 15 minutos.
      </p>

      <ol className="list-decimal space-y-4 pl-5 text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Abrí un Gmail solo para el casillero</span>
          {' '}(o usá uno que ya tengan). Ejemplo: casillero.alfabogados@gmail.com.
        </li>
        <li>
          En esa cuenta de Google, activá la verificación en 2 pasos:{' '}
          <a
            href="https://myaccount.google.com/signinoptions/two-step-verification"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            verificación en 2 pasos <ExternalLink className="size-3" />
          </a>
        </li>
        <li>
          Creá una{' '}
          <span className="font-medium text-foreground">contraseña de aplicación</span>:{' '}
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            myaccount.google.com/apppasswords <ExternalLink className="size-3" />
          </a>
          . Elegí Correo → Otro → nombre “Alfa Abogados”. Copiá las 16 letras (los espacios no
          importan).
        </li>
        <li>
          En Gmail: engranaje → Ver toda la configuración →{' '}
          <span className="font-medium text-foreground">Reenvío y POP/IMAP</span> →{' '}
          <span className="font-medium text-foreground">Activar IMAP</span> → Guardar.
        </li>
        <li>
          En Hotmail (<span className="font-medium text-foreground">alfabogados1@hotmail.com</span>
          ): engranaje → Ver todas las opciones → Correo →{' '}
          <span className="font-medium text-foreground">Reglas</span> → Agregar:
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Nombre: Casillero a Gmail</li>
            <li>Si el remitente incluye <code>funcionjudicial.gob.ec</code></li>
            <li>Reenviar a: el Gmail del paso 1</li>
            <li>Guardá. Si pide verificación en 2 pasos de Microsoft, activala.</li>
          </ul>
        </li>
        <li>Pegá abajo el Gmail y la contraseña de aplicación (no la de la cuenta).</li>
      </ol>

      {puedeConfigurar ? (
        <form onSubmit={guardar} className="space-y-3 rounded-lg border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="gmail">Gmail del casillero</Label>
            <Input
              id="gmail"
              type="email"
              required
              autoComplete="off"
              placeholder="casillero@gmail.com"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apppw">Contraseña de aplicación</Label>
            <Input
              id="apppw"
              type="password"
              required
              autoComplete="new-password"
              placeholder="xxxx xxxx xxxx xxxx"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={guardando || usuario.length < 6}>
            {guardando && <Loader2 className="animate-spin" />} Probar y guardar
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground">
          Pedile a un administrador que complete Gmail y la regla de Hotmail. Mientras
          tanto podés pegar notificaciones en Causas.
        </p>
      )}
    </div>
  );
}

function CasilleroConectado({
  usuario,
  puedeConfigurar,
  onCambio,
}: {
  usuario: string;
  puedeConfigurar: boolean;
  onCambio: () => void;
}) {
  const [importando, setImportando] = useState(false);
  const [quitando, setQuitando] = useState(false);

  async function importar() {
    setImportando(true);
    try {
      const { resultado } = await apiMutate<{
        resultado: { leidos: number; casillero: number; ingresados: number; errores: number };
      }>('/api/correos/casillero', 'POST');
      toast.success(
        resultado.ingresados > 0
          ? `${resultado.ingresados} notificación(es) del casillero en el expediente`
          : `Sin notificaciones nuevas (${resultado.leidos} correos leídos)`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo importar el casillero');
    } finally {
      setImportando(false);
    }
  }

  async function desconectar() {
    setQuitando(true);
    try {
      await apiMutate('/api/correos/imap', 'DELETE');
      toast.success('Gmail desconectado');
      onCambio();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo desconectar');
    } finally {
      setQuitando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Casillero automático</h1>
          <p className="text-sm text-muted-foreground">
            Leyendo <span className="font-medium text-foreground">{usuario}</span>
            {' · '}cada 15 min mientras la app esté abierta
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void importar()} disabled={importando}>
            {importando ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            Importar ahora
          </Button>
          {puedeConfigurar && (
            <Button variant="ghost" size="sm" onClick={() => void desconectar()} disabled={quitando}>
              Desconectar
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Para probar: en Hotmail, reenviá a mano un mail de Función Judicial al Gmail y
        tocá Importar ahora.
      </p>
    </div>
  );
}

function ResumenConectado({
  onCrearEvento,
}: {
  onCrearEvento: (b: EventoBorrador) => void;
}) {
  const { data, isLoading, mutate } = useSWR<{ resumen: Resumen }>(
    '/api/correos/resumen',
    fetcher,
  );
  const [actualizando, setActualizando] = useState(false);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (data?.resumen.grupos[0]) {
      setAbiertos((a) => ({ ...a, [data.resumen.grupos[0]!.categoria]: true }));
    }
  }, [data]);

  async function actualizar() {
    setActualizando(true);
    try {
      await mutate(fetcher('/api/correos/resumen?forzar=1'), { revalidate: false });
    } catch {
      toast.error('No se pudo actualizar');
    } finally {
      setActualizando(false);
    }
  }

  async function crearEvento(c: Correo) {
    let causaId: string | null = null;
    if (c.numero_juicio) {
      try {
        const r = await fetcher<{ causas: { id: string; numeroJuicio: string }[] }>(
          `/api/causas?q=${encodeURIComponent(c.numero_juicio)}`,
        );
        causaId = r.causas.find((x) => x.numeroJuicio === c.numero_juicio)?.id ?? null;
      } catch {
        /* noop */
      }
    }
    const tipo = /audiencia/i.test(c.asunto) ? 'audiencia' : 'escrito';
    onCrearEvento({
      tipo,
      titulo: inferirEtiqueta(`${c.asunto} ${c.resumen_1_linea}`, tipo),
      fecha: hoyISO(),
      hora: null,
      causaId,
      clienteId: null,
      descripcion: `${c.remitente}\n\n${c.resumen_1_linea}`,
      numeroJuicioDetectado: c.numero_juicio ?? null,
    });
  }

  const grupos = data?.resumen.grupos ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {grupos.map((g) => `${g.cantidad} de ${g.categoria}`).join(' · ') ||
            'Resumen de Outlook'}
        </h2>
        <Button variant="outline" size="sm" onClick={actualizar} disabled={actualizando}>
          {actualizando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Actualizar ahora
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <div className="space-y-2">
        {grupos.map((g) => (
          <div key={g.categoria} className="rounded-lg border bg-card">
            <button
              type="button"
              onClick={() => setAbiertos((a) => ({ ...a, [g.categoria]: !a[g.categoria] }))}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium"
            >
              <ChevronRight
                className={cn('size-4 transition-transform', abiertos[g.categoria] && 'rotate-90')}
              />
              {g.categoria}
              <Badge variant="secondary" className="ml-auto">{g.cantidad}</Badge>
            </button>
            {abiertos[g.categoria] && (
              <ul className="divide-y border-t">
                {g.correos.map((c, i) => (
                  <li key={i} className="px-4 py-2.5 text-sm">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{c.asunto}</p>
                        <p className="text-xs text-muted-foreground">{c.remitente}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{c.resumen_1_linea}</p>
                      </div>
                      {c.requiere_accion && c.numero_juicio && (
                        <Button size="sm" variant="outline" onClick={() => crearEvento(c)}>
                          <CalendarPlus className="size-3.5" /> Crear evento
                        </Button>
                      )}
                    </div>
                    {c.numero_juicio && (
                      <Badge variant="outline" className="mt-1">{c.numero_juicio}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
