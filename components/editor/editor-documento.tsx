'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import { EditorContent, useEditor } from '@tiptap/react';
import { extensionesEditor } from '@/components/editor/extensiones';
import { EditorToolbar } from '@/components/editor/toolbar';
import { BarraSuperior } from '@/components/editor/barra-superior';
import { BarraIAEditor } from '@/components/editor/barra-ia-editor';
import { colorDeUsuario } from '@/lib/editor/colores';
import type { DocumentoDTO } from '@/lib/documentos';

type EstadoGuardado = 'sincronizando' | 'editando' | 'guardado';

type CollabBundle = {
  documentoId: string;
  doc: Y.Doc;
  provider: HocuspocusProvider;
  persistence: IndexeddbPersistence;
};

function collabUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3000/collab';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/collab`;
}

function crearCollab(documentoId: string): CollabBundle {
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: collabUrl(),
    name: documentoId,
    document: doc,
  });
  const persistence = new IndexeddbPersistence(`bufete-doc-${documentoId}`, doc);
  return { documentoId, doc, provider, persistence };
}

function destruirCollab(bundle: CollabBundle): void {
  bundle.provider.destroy();
  void bundle.persistence.destroy();
  bundle.doc.destroy();
}

export function EditorDocumento({
  documento,
  usuario,
  puedeEditar,
  iaDisponible,
}: {
  documento: DocumentoDTO;
  usuario: { id: string; nombre: string; role: string };
  puedeEditar: boolean;
  iaDisponible: boolean;
}) {
  const [estadoGuardado, setEstadoGuardado] =
    useState<EstadoGuardado>('sincronizando');
  const [conectados, setConectados] = useState<string[]>([]);
  const [collab] = useState(() => crearCollab(documento.id));

  const { doc, provider } = collab;

  const colorUsuario = colorDeUsuario(usuario.id);
  const extensiones = useMemo(
    () =>
      extensionesEditor({
        doc,
        provider,
        usuario: { nombre: usuario.nombre, color: colorUsuario },
      }),
    [doc, provider, usuario.nombre, colorUsuario],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: puedeEditar,
      extensions: extensiones,
      editorProps: {
        attributes: {
          class:
            'max-w-none font-[Times_New_Roman,Times,serif] text-[12pt] leading-[var(--interlineado,1.5)] text-black focus:outline-none',
        },
      },
      onUpdate: () => {
        setEstadoGuardado('editando');
        window.setTimeout(() => setEstadoGuardado('guardado'), 2500);
      },
    },
    [documento.id, extensiones],
  );

  useEffect(() => {
    const onSynced = () => setEstadoGuardado('guardado');
    provider.on('synced', onSynced);

    const onAwareness = () => {
      const estados = Array.from(
        provider.awareness?.getStates().values() ?? [],
      ) as { user?: { name?: string } }[];
      setConectados(
        estados.map((s) => s.user?.name ?? 'Anónimo').filter(Boolean),
      );
    };
    provider.awareness?.on('change', onAwareness);
    onAwareness();

    return () => {
      provider.off('synced', onSynced);
      provider.awareness?.off('change', onAwareness);
    };
  }, [provider]);

  useEffect(() => {
    return () => destruirCollab(collab);
  }, [collab]);

  useEffect(() => {
    editor?.setEditable(puedeEditar);
  }, [editor, puedeEditar]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-200 dark:bg-zinc-800">
      <BarraSuperior
        documento={documento}
        estadoGuardado={estadoGuardado}
        conectados={conectados}
        usuario={usuario}
        editor={editor}
      />
      {editor && puedeEditar && (
        <div className="no-print shrink-0 border-b bg-card">
          <EditorToolbar editor={editor} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="pagina-escrito mx-auto min-h-full w-full bg-white px-10 py-8 text-black shadow-sm sm:px-16 sm:py-10 lg:px-24 lg:py-12">
          <EditorContent editor={editor} className="h-full min-h-[60vh]" />
        </div>
      </div>
      {editor && puedeEditar && (
        <BarraIAEditor
          editor={editor}
          documento={documento}
          iaDisponible={iaDisponible}
        />
      )}
    </div>
  );
}
