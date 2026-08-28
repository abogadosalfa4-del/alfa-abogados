'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SubirArchivo({
  causaId,
  onSubido,
}: {
  causaId: string;
  onSubido: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  async function subir(files: FileList | null) {
    if (!files || files.length === 0) return;
    setSubiendo(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/causas/${causaId}/archivos`, {
          method: 'POST',
          body: fd,
          credentials: 'same-origin',
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error?.message ?? `Error ${res.status}`);
        }
      }
      toast.success('Archivo(s) subido(s)');
      onSubido();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void subir(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground transition-colors',
        drag ? 'border-primary bg-primary/5' : 'hover:bg-accent/30',
      )}
    >
      {subiendo ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
      {subiendo ? 'Subiendo…' : 'Arrastrá archivos aquí o hacé clic (PDF, DOCX, imágenes — máx. 25 MB)'}
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept=".pdf,.doc,.docx,.txt,image/*"
        onChange={(e) => void subir(e.target.files)}
      />
    </div>
  );
}
