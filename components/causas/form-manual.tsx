'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Plus, X } from 'lucide-react';
import { apiMutate } from '@/lib/api';
import { causaManualSchema } from '@/lib/schemas/causa';
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

type Parte = { tipo: 'actor' | 'demandado' | 'tercero'; nombre: string; representante: string };
type Act = { fecha: string; tipo: string; detalle: string };

export function FormularioCausaManual({
  abierto,
  onOpenChange,
  numeroInicial,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  numeroInicial: string;
}) {
  const router = useRouter();
  const [numeroJuicio, setNumero] = useState(numeroInicial);
  const [clienteNombre, setCliente] = useState('');
  const [materia, setMateria] = useState('');
  const [tipoAccion, setTipo] = useState('');
  const [judicatura, setJudicatura] = useState('');
  const [estado, setEstado] = useState('');
  const [partes, setPartes] = useState<Parte[]>([
    { tipo: 'actor', nombre: '', representante: '' },
    { tipo: 'demandado', nombre: '', representante: '' },
  ]);
  const [acts, setActs] = useState<Act[]>([]);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      numeroJuicio: numeroJuicio.trim(),
      clienteNombre: clienteNombre.trim() || null,
      materia: materia.trim() || null,
      tipoAccion: tipoAccion.trim() || null,
      judicatura: judicatura.trim() || null,
      estado: estado.trim() || null,
      partes: partes
        .filter((p) => p.nombre.trim())
        .map((p) => ({ ...p, representante: p.representante.trim() || null })),
      actuaciones: acts.filter((a) => a.fecha && a.tipo.trim() && a.detalle.trim()),
    };
    const parsed = causaManualSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setGuardando(true);
    try {
      const { causa } = await apiMutate<{ causa: { id: string } }>(
        '/api/causas',
        'POST',
        parsed.data,
      );
      toast.success('Causa registrada');
      onOpenChange(false);
      router.push(`/causas/${causa.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar causa manualmente</DialogTitle>
          <DialogDescription>
            Usá este formulario cuando e-SATJE no esté disponible. Se puede
            re-sincronizar con la Función Judicial más adelante.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nj">Número de juicio</Label>
              <Input id="nj" required value={numeroJuicio} onChange={(e) => setNumero(e.target.value)} placeholder="01204-2025-00334" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl">Cliente</Label>
              <Input id="cl" value={clienteNombre} onChange={(e) => setCliente(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ma">Materia</Label>
              <Input id="ma" value={materia} onChange={(e) => setMateria(e.target.value)} placeholder="Civil, Niñez…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ta">Tipo de acción</Label>
              <Input id="ta" value={tipoAccion} onChange={(e) => setTipo(e.target.value)} placeholder="Ordinario, Sumario…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ju">Judicatura</Label>
              <Input id="ju" value={judicatura} onChange={(e) => setJudicatura(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es">Estado</Label>
              <Input id="es" value={estado} onChange={(e) => setEstado(e.target.value)} />
            </div>
          </div>

          <FilaLista
            titulo="Partes procesales"
            onAgregar={() => setPartes((p) => [...p, { tipo: 'tercero', nombre: '', representante: '' }])}
          >
            {partes.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={p.tipo}
                  onValueChange={(v) =>
                    setPartes((arr) => arr.map((x, j) => (j === i ? { ...x, tipo: v as Parte['tipo'] } : x)))
                  }
                >
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actor">Actor</SelectItem>
                    <SelectItem value="demandado">Demandado</SelectItem>
                    <SelectItem value="tercero">Tercero</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="h-8"
                  placeholder="Nombre"
                  value={p.nombre}
                  onChange={(e) => setPartes((arr) => arr.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
                />
                <Input
                  className="h-8"
                  placeholder="Representante (opcional)"
                  value={p.representante}
                  onChange={(e) => setPartes((arr) => arr.map((x, j) => (j === i ? { ...x, representante: e.target.value } : x)))}
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => setPartes((arr) => arr.filter((_, j) => j !== i))}>
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </FilaLista>

          <FilaLista
            titulo="Actuaciones iniciales"
            onAgregar={() => setActs((a) => [...a, { fecha: '', tipo: '', detalle: '' }])}
          >
            {acts.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input
                  type="date"
                  className="h-8 w-40"
                  value={a.fecha}
                  onChange={(e) => setActs((arr) => arr.map((x, j) => (j === i ? { ...x, fecha: e.target.value } : x)))}
                />
                <Input
                  className="h-8 w-36"
                  placeholder="Tipo (CITACIÓN…)"
                  value={a.tipo}
                  onChange={(e) => setActs((arr) => arr.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))}
                />
                <Textarea
                  className="min-h-8"
                  placeholder="Detalle"
                  value={a.detalle}
                  onChange={(e) => setActs((arr) => arr.map((x, j) => (j === i ? { ...x, detalle: e.target.value } : x)))}
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => setActs((arr) => arr.filter((_, j) => j !== i))}>
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </FilaLista>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="animate-spin" />}
              Registrar causa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FilaLista({
  titulo,
  onAgregar,
  children,
}: {
  titulo: string;
  onAgregar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{titulo}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onAgregar}>
          <Plus className="size-4" /> Agregar
        </Button>
      </div>
      {children}
    </div>
  );
}
