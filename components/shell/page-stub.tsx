import type { LucideIcon } from 'lucide-react';

/**
 * Placeholder de sección mientras no esté implementada su fase (PLAN §15).
 */
export function PageStub({
  icon: Icon,
  titulo,
  fase,
  descripcion,
}: {
  icon: LucideIcon;
  titulo: string;
  fase: string;
  descripcion: string;
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{descripcion}</p>
      <p className="mt-4 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        Se implementa en la {fase}
      </p>
    </div>
  );
}
