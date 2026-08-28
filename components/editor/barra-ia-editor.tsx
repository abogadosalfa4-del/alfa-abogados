'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiMutate } from '@/lib/api';
import { NO_IA_MENSAJE } from '@/lib/ai/system-prompt';
import { sugerenciaIAKey, type SugerenciaIA } from '@/components/editor/extension-sugerencia-ia';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { DocumentoDTO } from '@/lib/documentos';

const ACCIONES_RAPIDAS = [
  'Completá la demanda desde donde quedó',
  'Agregá fundamentos de derecho',
  'Mejorá la redacción de la selección',
  'Agregá pretensión concreta',
] as const;

export function BarraIAEditor({
  editor,
  documento,
  iaDisponible,
}: {
  editor: Editor;
  documento: DocumentoDTO;
  iaDisponible: boolean;
}) {
  const [instruccion, setInstruccion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [pendiente, setPendiente] = useState(false);

  const actualizarPendiente = useCallback(() => {
    const n = sugerenciaIAKey.getState(editor.state)?.sugerencias.length ?? 0;
    setPendiente(n > 0);
  }, [editor]);

  useEffect(() => {
    actualizarPendiente();
    const onTx = () => actualizarPendiente();
    editor.on('transaction', onTx);
    return () => {
      editor.off('transaction', onTx);
    };
  }, [editor, actualizarPendiente]);

  async function solicitar(textoInstruccion: string) {
    const msg = textoInstruccion.trim();
    if (!msg) return;
    if (!iaDisponible) {
      toast.error(NO_IA_MENSAJE);
      return;
    }
    if (pendiente) {
      toast.message('Aceptá o descartá la sugerencia actual antes de pedir otra.');
      return;
    }

    const { from, to, empty } = editor.state.selection;
    const textoDocumento = editor.getText();
    const textoSeleccion = empty
      ? undefined
      : editor.state.doc.textBetween(from, to, '\n');

    setCargando(true);
    try {
      const resultado = await apiMutate<{
        texto: string;
        modo: 'insertar' | 'reemplazar';
      }>(`/api/documentos/${documento.id}/sugerir`, 'POST', {
        instruccion: msg,
        textoDocumento,
        textoSeleccion,
      });

      if (!resultado.texto.trim()) {
        toast.error('Gemini no devolvió texto. Intentá con otra instrucción.');
        return;
      }

      const sugerencia: SugerenciaIA = {
        id: crypto.randomUUID(),
        from,
        to: empty ? from : to,
        texto: resultado.texto,
        modo: resultado.modo,
      };

      editor.chain().focus().establecerSugerenciaIA(sugerencia).run();
      setInstruccion('');
      toast.message('Sugerencia lista — Tab o Aceptar para incorporar, Esc o Descartar para eliminar.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar la sugerencia');
    } finally {
      setCargando(false);
    }
  }

  function aceptar() {
    editor.chain().focus().aceptarSugerenciaIA().run();
  }

  function descartar() {
    editor.chain().focus().rechazarSugerenciaIA().run();
  }

  return (
    <div className="no-print shrink-0 border-t bg-card">
      {pendiente && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-3 py-2">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="text-xs text-muted-foreground">
            Sugerencia de IA pendiente (texto en azul atenuado)
          </span>
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="default" onClick={aceptar}>
              <Check className="size-4" />
              Aceptar
              <kbd className="ml-1 hidden rounded border bg-background/80 px-1 text-[10px] sm:inline">
                Tab
              </kbd>
            </Button>
            <Button size="sm" variant="outline" onClick={descartar}>
              <X className="size-4" />
              Descartar
              <kbd className="ml-1 hidden rounded border px-1 text-[10px] sm:inline">Esc</kbd>
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap gap-1.5">
          {ACCIONES_RAPIDAS.map((accion) => (
            <Button
              key={accion}
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              disabled={cargando || pendiente}
              onClick={() => solicitar(accion)}
            >
              {accion}
            </Button>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void solicitar(instruccion);
          }}
        >
          <Textarea
            value={instruccion}
            onChange={(e) => setInstruccion(e.target.value)}
            placeholder="Ej.: completame la demanda, agregá comparecencia, ayudame con los hechos…"
            rows={2}
            disabled={cargando}
            className="min-h-0 flex-1 resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void solicitar(instruccion);
              }
            }}
          />
          <Button
            type="submit"
            disabled={cargando || !instruccion.trim() || pendiente}
            className="shrink-0 self-end"
          >
            {cargando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Sugerir
          </Button>
        </form>

        {!iaDisponible && (
          <p className="text-xs text-muted-foreground">{NO_IA_MENSAJE}</p>
        )}
      </div>
    </div>
  );
}
