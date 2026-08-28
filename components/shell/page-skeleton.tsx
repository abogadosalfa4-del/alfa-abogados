import { Loader2 } from 'lucide-react';

export function PageSkeleton({ titulo }: { titulo?: string }) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {titulo ? (
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" aria-hidden />
      ) : null}
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Cargando{titulo ? ` ${titulo.toLowerCase()}` : ''}…
      </div>
    </div>
  );
}
