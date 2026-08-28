'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { apiMutate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function DialogPegarNotificacion({
  abierto,
  onOpenChange,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      const { causa, creada } = await apiMutate<{
        causa: { id: string; numeroJuicio: string; clienteId: string | null };
        creada: boolean;
      }>('/api/causas/desde-notificacion', 'POST', { texto });
      toast.success(
        creada
          ? `Causa ${causa.numeroJuicio} creada con la notificación`
          : `Notificación agregada a ${causa.numeroJuicio}`,
      );
      setTexto('');
      onOpenChange(false);
      router.push(causa.clienteId ? `/causas/cliente/${causa.clienteId}` : `/causas/${causa.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pegar notificación del casillero</DialogTitle>
          <DialogDescription>
            Pegá el correo completo. Se crea la causa (o se agrega la actuación si ya
            existe), el cliente (Nombre Litigante, no la abogada) y el texto del auto.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="notif">Texto de la notificación</Label>
            <Textarea
              id="notif"
              required
              className="min-h-[240px]"
              placeholder="Ctrl+V el correo del casillero electrónico…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando || texto.trim().length < 40}>
              {guardando && <Loader2 className="animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
