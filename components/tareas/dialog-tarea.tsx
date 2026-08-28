'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { apiMutate, fetcher } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  COLORES,
  COLOR_BARRA,
  tareaCreateSchema,
  type Color,
} from '@/lib/schemas/tarea';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SelectorVinculo, type Vinculo } from '@/components/calendario/selector-vinculo';
import type { TareaDTO } from '@/lib/tareas';

type Modo = { tipo: 'crear' } | { tipo: 'editar'; tarea: TareaDTO } | null;

interface Usuario {
  id: string;
  name: string;
}

export function DialogTarea({
  modo,
  onOpenChange,
  onCambio,
  userId,
}: {
  modo: Modo;
  onOpenChange: (abierto: boolean) => void;
  onCambio: () => void;
  userId: string;
}) {
  const { data } = useSWR<{ usuarios: Usuario[] }>(
    modo ? '/api/usuarios' : null,
    fetcher,
  );
  const editando = modo?.tipo === 'editar';
  const base = editando ? modo.tarea : null;

  const [titulo, setTitulo] = useState(base?.titulo ?? '');
  const [descripcion, setDescripcion] = useState(base?.descripcion ?? '');
  const [color, setColor] = useState<Color>((base?.color as Color) ?? 'blue');
  const [asignado, setAsignado] = useState<string>(base?.asignadoA ?? 'nadie');
  const [fechaLimite, setFechaLimite] = useState(base?.fechaLimite ?? '');
  const [vinculo, setVinculo] = useState<Vinculo>({
    causaId: base?.causaId ?? null,
    clienteId: null,
  });
  const [guardando, setGuardando] = useState(false);

  if (!modo) return null;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      color,
      asignadoA: asignado === 'nadie' ? null : asignado,
      fechaLimite: fechaLimite || null,
      causaId: vinculo.causaId,
    };
    const parsed = tareaCreateSchema
      .omit({ columna: true })
      .safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setGuardando(true);
    try {
      if (editando) {
        await apiMutate(`/api/tareas/${(modo as { tarea: TareaDTO }).tarea.id}`, 'PATCH', parsed.data);
        toast.success('Tarea actualizada');
      } else {
        await apiMutate('/api/tareas', 'POST', parsed.data);
        toast.success('Tarea creada');
      }
      onCambio();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!editando) return;
    setGuardando(true);
    try {
      await apiMutate(`/api/tareas/${modo.tarea.id}`, 'DELETE');
      toast.success('Tarea eliminada');
      onCambio();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="t-titulo">Título</Label>
            <Input
              id="t-titulo"
              required
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-desc">Descripción</Label>
            <Textarea
              id="t-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-1.5">
                {COLORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={c}
                    className={cn(
                      'size-6 rounded-full ring-offset-2 transition',
                      COLOR_BARRA[c],
                      color === c && 'ring-2 ring-ring',
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-fecha">Fecha límite</Label>
              <Input
                id="t-fecha"
                type="date"
                value={fechaLimite}
                onChange={(e) => setFechaLimite(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Asignar a</Label>
            <Select value={asignado} onValueChange={setAsignado}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nadie">Sin asignar</SelectItem>
                {data?.usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                    {u.id === userId ? ' (yo)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Causa</Label>
            <SelectorVinculo
              value={vinculo}
              onChange={(v) => setVinculo({ causaId: v.causaId, clienteId: null })}
            />
          </div>

          <DialogFooter className="sm:justify-between">
            {editando ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={borrar}
                disabled={guardando}
              >
                <Trash2 /> Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando && <Loader2 className="animate-spin" />}
                {editando ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
