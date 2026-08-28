'use client';

import useSWR from 'swr';
import { cn } from '@/lib/utils';
import { fetcher } from '@/lib/api';
import { COLORES, COLOR_BARRA, type Color } from '@/lib/schemas/tarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface Filtros {
  asignado: string | null;
  color: Color | null;
  soloMias: boolean;
}

interface Usuario {
  id: string;
  name: string;
}

export function FiltrosTareas({
  value,
  onChange,
}: {
  value: Filtros;
  onChange: (f: Filtros) => void;
}) {
  const { data } = useSWR<{ usuarios: Usuario[] }>('/api/usuarios', fetcher);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.asignado ?? 'todos'}
        onValueChange={(v) =>
          onChange({ ...value, asignado: v === 'todos' ? null : v })
        }
      >
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue placeholder="Asignado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos</SelectItem>
          {data?.usuarios.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        {COLORES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Filtrar color ${c}`}
            onClick={() =>
              onChange({ ...value, color: value.color === c ? null : c })
            }
            className={cn(
              'size-5 rounded-full ring-offset-2 transition',
              COLOR_BARRA[c],
              value.color === c && 'ring-2 ring-ring',
            )}
          />
        ))}
      </div>

      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={value.soloMias}
          onChange={(e) => onChange({ ...value, soloMias: e.target.checked })}
          className="size-3.5 rounded border-input"
        />
        Solo mías
      </label>
    </div>
  );
}
