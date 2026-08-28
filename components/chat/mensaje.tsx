'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { FileText, BookText, Scale } from 'lucide-react';
import type { UIMessage } from 'ai';
import { apiMutate } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface Fuente {
  fuente: string;
  tipo: string;
}

export function Mensaje({
  mensaje,
  causaId,
}: {
  mensaje: UIMessage;
  causaId: string | null;
}) {
  const router = useRouter();
  const esUsuario = mensaje.role === 'user';

  const texto = useMemo(
    () =>
      (mensaje.parts ?? [])
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n'),
    [mensaje.parts],
  );

  const herramientas = (mensaje.parts ?? []).filter((p) =>
    p.type.startsWith('tool-'),
  );

  const fuentes = ((mensaje.metadata as { fuentes?: Fuente[] } | undefined)?.fuentes ??
    []) as Fuente[];

  async function abrirEnEditor() {
    try {
      const { documento } = await apiMutate<{ documento: { id: string } }>(
        '/api/documentos/desde-chat',
        'POST',
        {
          titulo: texto.split('\n')[0]?.replace(/[#*]/g, '').slice(0, 120) || 'Documento del asistente',
          markdown: texto,
          causaId,
        },
      );
      router.push(`/documentos/${documento.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el documento');
    }
  }

  return (
    <div className={cn('flex', esUsuario ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-4 py-3 text-sm',
          esUsuario ? 'bg-primary text-primary-foreground' : 'bg-card border',
        )}
      >
        {herramientas.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {herramientas.map((h, i) => (
              <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {h.type.replace('tool-', '⚙ ')}
              </span>
            ))}
          </div>
        )}

        <div
          className={cn(
            'prose prose-sm max-w-none dark:prose-invert',
            esUsuario && 'prose-invert',
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{texto}</ReactMarkdown>
        </div>

        {!esUsuario && fuentes.length > 0 && (
          <div className="mt-3 border-t pt-2">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Fuentes consultadas
            </p>
            <div className="flex flex-wrap gap-1">
              {fuentes.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
                >
                  {f.tipo === 'codigo' ? <BookText className="size-3" /> : <Scale className="size-3" />}
                  {f.fuente}
                </span>
              ))}
            </div>
          </div>
        )}

        {!esUsuario && texto.length > 200 && (
          <Button variant="outline" size="sm" className="mt-3" onClick={abrirEnEditor}>
            <FileText className="size-3.5" /> Abrir en editor
          </Button>
        )}
      </div>
    </div>
  );
}
