'use client';

import type { Doc as YDoc } from 'yjs';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Collaboration } from '@tiptap/extension-collaboration';
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret';
import {
  TextStyle,
  FontFamily,
  FontSize,
  LineHeight,
  Color,
} from '@tiptap/extension-text-style';
import { TextAlign } from '@tiptap/extension-text-align';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Image } from '@tiptap/extension-image';
import { Placeholder, CharacterCount } from '@tiptap/extensions';
import { SugerenciaIA } from '@/components/editor/extension-sugerencia-ia';

export interface UsuarioEditor {
  nombre: string;
  color: string;
}

/**
 * Extensiones del editor forense (PLAN §8.1). Yjs gestiona el historial, por eso
 * se deshabilita `undoRedo` de StarterKit.
 */
export function extensionesEditor(params: {
  doc: YDoc;
  provider: HocuspocusProvider;
  usuario: UsuarioEditor;
}): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: false,
      link: { openOnClick: false },
    }),
    TextStyle,
    FontFamily,
    FontSize,
    LineHeight.configure({ types: ['paragraph', 'heading'] }),
    Color,
    TextAlign.configure({ types: ['paragraph', 'heading'] }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({ inline: false }),
    Placeholder.configure({
      placeholder: 'Empezá a redactar el escrito…',
    }),
    CharacterCount,
    Collaboration.configure({ document: params.doc, field: 'default' }),
    CollaborationCaret.configure({
      provider: params.provider,
      user: { name: params.usuario.nombre, color: params.usuario.color },
    }),
    SugerenciaIA,
  ];
}
