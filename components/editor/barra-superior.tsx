'use client';

import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  Printer,
  FileDown,
  Loader2,
  Send,
} from 'lucide-react';
import Link from 'next/link';
import { apiMutate } from '@/lib/api';
import { cn } from '@/lib/utils';
import { colorDeUsuario } from '@/lib/editor/colores';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { DocumentoDTO } from '@/lib/documentos';

const ESTADO_META: Record<
  DocumentoDTO['estado'],
  { label: string; variant: 'secondary' | 'warning' | 'default' }
> = {
  borrador: { label: 'Borrador', variant: 'secondary' },
  enviado: { label: 'Enviado a revisión', variant: 'warning' },
  aprobado: { label: 'Aprobado', variant: 'default' },
};

const GUARDADO_TEXTO = {
  sincronizando: 'Sincronizando…',
  editando: 'Guardando…',
  guardado: 'Guardado',
} as const;

export function BarraSuperior({
  documento,
  estadoGuardado,
  conectados,
  usuario,
  editor,
}: {
  documento: DocumentoDTO;
  estadoGuardado: keyof typeof GUARDADO_TEXTO;
  conectados: string[];
  usuario: { id: string; nombre: string; role: string };
  editor: Editor | null;
}) {
  const [titulo, setTitulo] = useState(documento.titulo);
  const [estado, setEstado] = useState(documento.estado);
  const [ocupado, setOcupado] = useState(false);

  const esRevisor = usuario.role === 'admin' || usuario.role === 'abogado';

  async function guardarTitulo() {
    const t = titulo.trim();
    if (!t || t === documento.titulo) return;
    try {
      await apiMutate(`/api/documentos/${documento.id}`, 'PATCH', { titulo: t });
    } catch {
      toast.error('No se pudo renombrar');
      setTitulo(documento.titulo);
    }
  }

  async function accion(a: 'enviar' | 'aprobar' | 'devolver') {
    setOcupado(true);
    try {
      const { documento: d } = await apiMutate<{ documento: DocumentoDTO }>(
        `/api/documentos/${documento.id}`,
        'PATCH',
        { accion: a },
      );
      setEstado(d.estado);
      toast.success(
        a === 'enviar'
          ? 'Enviado a revisión'
          : a === 'aprobar'
            ? 'Documento aprobado'
            : 'Devuelto a borrador',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar');
    } finally {
      setOcupado(false);
    }
  }

  function exportarDocx() {
    window.open(`/api/documentos/${documento.id}/export`, '_blank');
  }

  const meta = ESTADO_META[estado];

  return (
    <div className="no-print flex flex-wrap items-center gap-3 border-b bg-card px-4 py-2">
      <Button variant="ghost" size="icon" asChild>
        <Link href="/documentos" aria-label="Volver">
          <ArrowLeft className="size-4" />
        </Link>
      </Button>

      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onBlur={guardarTitulo}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm font-semibold hover:border-input focus:border-input focus:outline-none"
      />

      <Badge variant={meta.variant}>{meta.label}</Badge>

      <span
        className={cn(
          'text-xs',
          estadoGuardado === 'guardado' ? 'text-muted-foreground' : 'text-warning-foreground',
        )}
      >
        {GUARDADO_TEXTO[estadoGuardado]}
      </span>

      {conectados.length > 0 && (
        <div className="flex -space-x-2">
          {conectados.slice(0, 5).map((n, i) => (
            <span
              key={`${n}-${i}`}
              title={n}
              className="flex size-6 items-center justify-center rounded-full border-2 border-card text-[10px] font-medium text-white"
              style={{ backgroundColor: colorDeUsuario(n) }}
            >
              {n.slice(0, 2).toUpperCase()}
            </span>
          ))}
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {editor && (
          <span className="mr-2 text-xs text-muted-foreground">
            {editor.storage.characterCount?.words?.() ?? 0} palabras
          </span>
        )}
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> Imprimir
        </Button>
        <Button variant="outline" size="sm" onClick={exportarDocx}>
          <FileDown className="size-4" /> .docx
        </Button>

        {estado === 'borrador' && (
          <Button size="sm" onClick={() => accion('enviar')} disabled={ocupado}>
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Enviar a revisión
          </Button>
        )}
        {estado === 'enviado' && esRevisor && (
          <>
            <Button variant="outline" size="sm" onClick={() => accion('devolver')} disabled={ocupado}>
              Devolver
            </Button>
            <Button size="sm" onClick={() => accion('aprobar')} disabled={ocupado}>
              <Check className="size-4" /> Aprobar
            </Button>
          </>
        )}
        {estado === 'aprobado' && esRevisor && (
          <Button variant="outline" size="sm" onClick={() => accion('devolver')} disabled={ocupado}>
            Reabrir
          </Button>
        )}
      </div>
    </div>
  );
}
