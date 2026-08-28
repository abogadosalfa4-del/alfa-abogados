'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { apiMutate, fetcher } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

interface Regla {
  id: string;
  nombre: string;
  actuacionTrigger: string;
  tipoProceso: string;
  dias: number;
  tipoDias: 'habiles' | 'calendario';
  eventoTipo: string | null;
  eventoTituloTemplate: string | null;
  activo: boolean;
}

const PROCESOS = ['*', 'ordinario', 'sumario', 'ejecutivo', 'monitorio', 'niñez'];

export function EditorReglas() {
  const { data, mutate } = useSWR<{ reglas: Regla[] }>('/api/admin/reglas', fetcher);
  const [editar, setEditar] = useState<Regla | 'nueva' | null>(null);

  async function borrar(id: string) {
    try {
      await apiMutate(`/api/admin/reglas/${id}`, 'DELETE');
      void mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function reseed() {
    const res = await fetch('/api/admin/reglas', {
      method: 'POST',
      headers: { 'X-Seed': '1' },
      credentials: 'same-origin',
    });
    const j = await res.json();
    toast.success(`Reglas por defecto: ${j.insertadas} nuevas`);
    void mutate();
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Reglas de plazo</h1>
          <p className="text-xs text-muted-foreground">
            Los días son defaults; verificá con el COGEP vigente.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reseed}>
            Restaurar defaults
          </Button>
          <Button size="sm" onClick={() => setEditar('nueva')}>
            <Plus className="size-4" /> Nueva
          </Button>
        </div>
      </div>

      <ul className="divide-y rounded-lg border bg-card">
        {(data?.reglas ?? []).map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{r.nombre}</p>
              <p className="text-xs text-muted-foreground">
                contiene «{r.actuacionTrigger}» · {r.tipoProceso} · {r.dias}{' '}
                {r.tipoDias} · {r.eventoTipo ?? '—'}
              </p>
            </div>
            {!r.activo && <Badge variant="secondary">inactiva</Badge>}
            <Button variant="ghost" size="sm" onClick={() => setEditar(r)}>
              Editar
            </Button>
            <Button variant="ghost" size="icon" onClick={() => borrar(r.id)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </li>
        ))}
      </ul>

      {editar && (
        <DialogRegla
          regla={editar === 'nueva' ? null : editar}
          onOpenChange={() => setEditar(null)}
          onGuardado={() => {
            setEditar(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}

function DialogRegla({
  regla,
  onOpenChange,
  onGuardado,
}: {
  regla: Regla | null;
  onOpenChange: () => void;
  onGuardado: () => void;
}) {
  const [f, setF] = useState({
    nombre: regla?.nombre ?? '',
    actuacionTrigger: regla?.actuacionTrigger ?? '',
    tipoProceso: regla?.tipoProceso ?? '*',
    dias: regla?.dias ?? 15,
    tipoDias: regla?.tipoDias ?? ('habiles' as 'habiles' | 'calendario'),
    eventoTipo: regla?.eventoTipo ?? 'escrito',
    eventoTituloTemplate: regla?.eventoTituloTemplate ?? 'Vence — {cliente}',
    activo: regla?.activo ?? true,
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      if (regla) {
        await apiMutate(`/api/admin/reglas/${regla.id}`, 'PATCH', f);
      } else {
        await apiMutate('/api/admin/reglas', 'POST', f);
      }
      toast.success('Regla guardada');
      onGuardado();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{regla ? 'Editar regla' : 'Nueva regla'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Trigger (substring)</Label>
              <Input required value={f.actuacionTrigger} onChange={(e) => setF({ ...f, actuacionTrigger: e.target.value })} placeholder="CITACION" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de proceso</Label>
              <Select value={f.tipoProceso} onValueChange={(v) => setF({ ...f, tipoProceso: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROCESOS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Días</Label>
              <Input type="number" min={0} value={f.dias} onChange={(e) => setF({ ...f, dias: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de días</Label>
              <Select value={f.tipoDias} onValueChange={(v) => setF({ ...f, tipoDias: v as 'habiles' | 'calendario' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="habiles">Hábiles (término)</SelectItem>
                  <SelectItem value="calendario">Calendario (plazo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de evento</Label>
              <Select value={f.eventoTipo} onValueChange={(v) => setF({ ...f, eventoTipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="escrito">Escrito</SelectItem>
                  <SelectItem value="audiencia">Audiencia</SelectItem>
                  <SelectItem value="diligencia">Diligencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Plantilla de título ({'{cliente}'} se reemplaza)</Label>
            <Input value={f.eventoTituloTemplate} onChange={(e) => setF({ ...f, eventoTituloTemplate: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
            Activa
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onOpenChange}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
