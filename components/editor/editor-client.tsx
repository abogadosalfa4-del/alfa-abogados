'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { DocumentoDTO } from '@/lib/documentos';

const EditorDocumento = dynamic(
  () =>
    import('@/components/editor/editor-documento').then((m) => m.EditorDocumento),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Cargando editor…
      </div>
    ),
  },
);

export function EditorClient(props: {
  documento: DocumentoDTO;
  usuario: { id: string; nombre: string; role: string };
  puedeEditar: boolean;
  iaDisponible: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EditorDocumento key={props.documento.id} {...props} />
    </div>
  );
}
