'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Pencil, Check, Ban, ChevronRight } from 'lucide-react';
import { es } from 'date-fns/locale';
import { apiMutate } from '@/lib/api';
import { eventoCreateSchema } from '@/lib/schemas/evento';
import {
  ETIQUETA_A_TIPO,
  ETIQUETAS_EVENTO,
  ESTADO_EVENTO,
  esFalloSistema,
  inferirEtiqueta,
  textoCliente,
  textoJuicio,
  type EtiquetaEvento,
} from '@/lib/etiquetas-evento';
import { formatDate, fromYmd } from '@/lib/fechas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { SelectorVinculo, type Vinculo } from '@/components/calendario/selector-vinculo';
import { TIPO_META } from '@/components/calendario/meta';
import type { EventoDTO } from '@/lib/eventos';
import type { EventoBorrador } from '@/lib/outlook/clasificador';

type Modo =
  | { tipo: 'crear'; fecha: string; borrador?: EventoBorrador }
  | { tipo: 'editar'; evento: EventoDTO }
  | { tipo: 'detalle'; evento: EventoDTO };

export function DialogEvento({
  modo,
  onOpenChange,
  puedeEditar,
  onCambio,
  onSolicitarEdicion,
}: {
  modo: Modo | null;
  onOpenChange: (abierto: boolean) => void;
  puedeEditar: boolean;
  onCambio: () => void;
  onSolicitarEdicion: (evento: EventoDTO) => void;
}) {
  if (!modo) return null;
  if (modo.tipo === 'detalle') {
    return (
      <DetalleEvento
        evento={modo.evento}
        puedeEditar={puedeEditar}
        onOpenChange={onOpenChange}
        onCambio={onCambio}
        onEditar={() => onSolicitarEdicion(modo.evento)}
      />
    );
  }
  return (
    <FormularioEvento
      modo={modo}
      onOpenChange={onOpenChange}
      onCambio={onCambio}
    />
  );
}

function FormularioEvento({
  modo,
  onOpenChange,
  onCambio,
}: {
  modo:
    | { tipo: 'crear'; fecha: string; borrador?: EventoBorrador }
    | { tipo: 'editar'; evento: EventoDTO };
  onOpenChange: (abierto: boolean) => void;
  onCambio: () => void;
}) {
  const editando = modo.tipo === 'editar';
  const base = editando ? modo.evento : null;
  const borrador = modo.tipo === 'crear' ? modo.borrador : undefined;

  const [etiqueta, setEtiqueta] = useState<EtiquetaEvento>(() =>
    inferirEtiqueta(
      `${base?.titulo ?? borrador?.titulo ?? ''} ${base?.descripcion ?? borrador?.descripcion ?? ''}`,
      base?.tipo ?? borrador?.tipo,
    ),
  );
  const [fecha, setFecha] = useState(
    base?.fecha ?? (modo.tipo === 'crear' ? modo.fecha : ''),
  );
  const [hora, setHora] = useState(base?.hora ?? borrador?.hora ?? '');
  const [descripcion, setDescripcion] = useState(
    base?.descripcion ?? borrador?.descripcion ?? '',
  );
  const [vinculo, setVinculo] = useState<Vinculo>({
    causaId: base?.causaId ?? borrador?.causaId ?? null,
    clienteId: base?.clienteId ?? borrador?.clienteId ?? null,
  });
  const [guardando, setGuardando] = useState(false);
  const tipo = ETIQUETA_A_TIPO[etiqueta];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vinculo.causaId) {
      toast.error('El evento debe tener un número de juicio.');
      return;
    }
    const payload = {
      tipo,
      titulo: etiqueta,
      fecha,
      hora: hora || null,
      descripcion: descripcion.trim() || null,
      causaId: vinculo.causaId,
      clienteId: vinculo.clienteId,
    };
    const parsed = eventoCreateSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setGuardando(true);
    try {
      if (editando) {
        await apiMutate(`/api/eventos/${modo.evento.id}`, 'PATCH', parsed.data);
        toast.success('Evento actualizado');
      } else {
        await apiMutate('/api/eventos', 'POST', parsed.data);
        toast.success(
          tipo === 'escrito'
            ? 'Evento creado — se generó una tarea para prepararlo'
            : 'Evento creado',
        );
      }
      onCambio();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editando ? 'Editar evento' : borrador ? 'Confirmar evento del correo' : 'Nuevo evento'}
          </DialogTitle>
          <DialogDescription>
            Primero la etiqueta rápida. El juzgado y el resto se ven al abrir Detalles.
          </DialogDescription>
        </DialogHeader>

        {borrador?.numeroJuicioDetectado && !vinculo.causaId && (
          <p className="rounded bg-warning/10 px-2 py-1.5 text-xs text-warning-foreground">
            Se detectó el juicio {borrador.numeroJuicioDetectado} pero no está
            registrado como causa. Vinculalo para poder guardar.
          </p>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="etiqueta">Etiqueta</Label>
            <Select
              value={etiqueta}
              onValueChange={(v) => setEtiqueta(v as EtiquetaEvento)}
            >
              <SelectTrigger id="etiqueta">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ETIQUETAS_EVENTO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha</Label>
              <Input
                id="fecha"
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hora">Hora (opcional)</Label>
              <Input
                id="hora"
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Juicio (obligatorio)</Label>
            <SelectorVinculo
              value={vinculo}
              onChange={setVinculo}
              modo="juicio"
              obligatorio
              textoMostrado={vinculo.causaId ? (base?.causaNumero ?? null) : null}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Notas (opcional)</Label>
            <Textarea
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="animate-spin" />}
              {editando ? 'Guardar' : 'Crear evento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function hrefExpediente(evento: EventoDTO): string | null {
  if (evento.clienteId && evento.causaId) {
    return `/causas/cliente/${evento.clienteId}?causa=${evento.causaId}`;
  }
  if (evento.clienteId) return `/causas/cliente/${evento.clienteId}`;
  if (evento.causaId) return `/causas/${evento.causaId}`;
  return null;
}

function DetalleEvento({
  evento,
  puedeEditar,
  onOpenChange,
  onCambio,
  onEditar,
}: {
  evento: EventoDTO;
  puedeEditar: boolean;
  onOpenChange: (abierto: boolean) => void;
  onCambio: () => void;
  onEditar: () => void;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const meta = TIPO_META[evento.tipo];
  const etiqueta = evento.etiqueta ?? inferirEtiqueta(evento.titulo, evento.tipo);
  const juicio = textoJuicio(evento.causaNumero);
  const cliente = textoCliente(evento.clienteNombre);
  const destino = hrefExpediente(evento);
  const fechaCorta = formatDate(fromYmd(evento.fecha), "EEE d 'de' LLL", { locale: es });

  async function cambiarEstado(estado: 'cumplido' | 'cancelado') {
    setOcupado(true);
    try {
      await apiMutate(`/api/eventos/${evento.id}`, 'PATCH', { estado });
      toast.success(estado === 'cumplido' ? 'Marcado como cumplido' : 'Evento cancelado');
      onCambio();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setOcupado(false);
    }
  }

  function verMasDetalles() {
    if (!destino) {
      toast.error('Este evento no tiene juicio ni cliente vinculados.');
      return;
    }
    onOpenChange(false);
    router.push(destino);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            <DialogTitle>{etiqueta}</DialogTitle>
          </div>
          <DialogDescription className="capitalize">
            {fechaCorta}
            {evento.hora ? ` · ${evento.hora}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <p
            className={
              esFalloSistema(juicio)
                ? 'font-semibold text-destructive'
                : 'font-semibold tabular-nums'
            }
          >
            {juicio}
          </p>
          <p
            className={
              esFalloSistema(cliente)
                ? 'text-sm font-medium text-destructive'
                : 'text-sm text-muted-foreground'
            }
          >
            {cliente}
          </p>
          <Badge variant={evento.estado === 'cancelado' ? 'destructive' : 'secondary'}>
            {ESTADO_EVENTO[evento.estado] ?? evento.estado}
          </Badge>
        </div>

        <Button onClick={verMasDetalles} disabled={!destino}>
          Ver más detalles
          <ChevronRight />
        </Button>

        {puedeEditar && evento.estado === 'pendiente' && (
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" onClick={onEditar} disabled={ocupado}>
              <Pencil /> Editar
            </Button>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => cambiarEstado('cancelado')}
                disabled={ocupado}
              >
                <Ban /> Cancelar
              </Button>
              <Button
                onClick={() => cambiarEstado('cumplido')}
                disabled={ocupado}
              >
                <Check /> Cumplido
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
