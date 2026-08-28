import { Loader2 } from 'lucide-react';

export default function AppLoading() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" />
      Cargando sección…
    </div>
  );
}
