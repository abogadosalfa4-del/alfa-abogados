'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { apiMutate, fetcher } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const ROLES = ['admin', 'abogado', 'secretario', 'asistente'] as const;
type Rol = (typeof ROLES)[number];

interface Usuario {
  id: string;
  name: string;
  email: string;
  role: Rol;
  activo: boolean;
}

export function AdminUsuarios() {
  const { data, mutate } = useSWR<{ usuarios: Usuario[] }>('/api/admin/usuarios', fetcher);
  const [nuevo, setNuevo] = useState(false);

  async function cambiar(id: string, patch: Record<string, unknown>) {
    try {
      await apiMutate(`/api/admin/usuarios/${id}`, 'PATCH', patch);
      void mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar');
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Usuarios</h1>
        <Button size="sm" onClick={() => setNuevo(true)}>
          <Plus className="size-4" /> Nuevo usuario
        </Button>
      </div>

      <ul className="divide-y rounded-lg border bg-card">
        {(data?.usuarios ?? []).map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{u.name}</p>
              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
            </div>
            <Select value={u.role} onValueChange={(v) => cambiar(u.id, { role: v })}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={u.activo}
                onChange={(e) => cambiar(u.id, { activo: e.target.checked })}
              />
              activo
            </label>
          </li>
        ))}
      </ul>

      <DialogNuevoUsuario abierto={nuevo} onOpenChange={setNuevo} onCreado={() => mutate()} />
    </div>
  );
}

function DialogNuevoUsuario({
  abierto,
  onOpenChange,
  onCreado,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  onCreado: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Rol>('asistente');
  const [guardando, setGuardando] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await apiMutate('/api/admin/usuarios', 'POST', { nombre, email, password, role });
      toast.success('Usuario creado');
      setNombre('');
      setEmail('');
      setPassword('');
      onOpenChange(false);
      onCreado();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
        </DialogHeader>
        <form onSubmit={crear} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="un">Nombre</Label>
            <Input id="un" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ue">Correo</Label>
            <Input id="ue" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="up">Contraseña (mín. 8)</Label>
            <Input id="up" type="text" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Rol)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="animate-spin" />} Crear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
