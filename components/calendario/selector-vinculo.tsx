'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { fetcher } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface Vinculo {
  causaId: string | null;
  clienteId: string | null;
}

interface Opcion {
  id: string;
  label: string;
  clienteId?: string | null;
}
interface Respuesta {
  clientes: Opcion[];
  causas: Opcion[];
}

export function SelectorVinculo({
  value,
  onChange,
  modo = 'libre',
  obligatorio = false,
  textoMostrado,
}: {
  value: Vinculo;
  onChange: (v: Vinculo) => void;
  modo?: 'libre' | 'juicio';
  obligatorio?: boolean;
  textoMostrado?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data } = useSWR<Respuesta>(
    open ? `/api/vinculos?q=${encodeURIComponent(q)}` : null,
    fetcher,
    { keepPreviousData: true },
  );

  const [textoElegido, setTextoElegido] = useState<string | null>(null);
  useEffect(() => {
    if (!value.causaId && !value.clienteId) setTextoElegido(null);
  }, [value]);

  const soloJuicio = modo === 'juicio';
  const seleccionadoTexto =
    textoMostrado ??
    textoElegido ??
    (value.causaId ? 'Juicio vinculado' : value.clienteId ? 'Cliente vinculado' : null);
  const placeholder = soloJuicio
    ? 'Elegí el juicio (obligatorio)'
    : 'Vincular a causa o cliente (opcional)';

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
          >
            <span className={cn(!seleccionadoTexto && 'text-muted-foreground')}>
              {seleccionadoTexto ?? placeholder}
            </span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={
                soloJuicio
                  ? 'Buscar por número de juicio o cliente…'
                  : 'Buscar por nombre, cédula o número…'
              }
              value={q}
              onValueChange={setQ}
            />
            <CommandList>
              <CommandEmpty>Sin resultados.</CommandEmpty>
              {data?.causas.length ? (
                <CommandGroup heading="Juicios">
                  {data.causas.map((o) => (
                    <CommandItem
                      key={`causa-${o.id}`}
                      value={`causa-${o.id}`}
                      onSelect={() => {
                        onChange({ causaId: o.id, clienteId: o.clienteId ?? null });
                        setTextoElegido(o.label);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'size-4',
                          value.causaId === o.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {!soloJuicio && data?.clientes.length ? (
                <CommandGroup heading="Clientes">
                  {data.clientes.map((o) => (
                    <CommandItem
                      key={`cliente-${o.id}`}
                      value={`cliente-${o.id}`}
                      onSelect={() => {
                        onChange({ causaId: null, clienteId: o.id });
                        setTextoElegido(o.label);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'size-4',
                          value.clienteId === o.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {!obligatorio && (value.causaId || value.clienteId) && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            onChange({ causaId: null, clienteId: null });
            setTextoElegido(null);
          }}
          aria-label="Quitar vínculo"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
