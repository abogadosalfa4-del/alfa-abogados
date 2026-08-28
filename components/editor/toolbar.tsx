'use client';

import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Table as TableIcon,
  Undo2,
  Redo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const FUENTES = ['Times New Roman', 'Arial', 'Georgia'];
const TAMANOS = ['10', '11', '12', '13', '14', '16'];
const INTERLINEADOS: { label: string; value: string }[] = [
  { label: '1.0', value: '1' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2' },
];

function Btn({
  activo,
  onClick,
  children,
  titulo,
}: {
  activo?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  titulo: string;
}) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded hover:bg-accent [&_svg]:size-4',
        activo && 'bg-accent text-accent-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5">
      <Select
        value={
          FUENTES.find((f) => editor.isActive('textStyle', { fontFamily: f })) ??
          'Times New Roman'
        }
        onValueChange={(v) => editor.chain().focus().setFontFamily(v).run()}
      >
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FUENTES.map((f) => (
            <SelectItem key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={
          TAMANOS.find((t) =>
            editor.isActive('textStyle', { fontSize: `${t}pt` }),
          ) ?? '12'
        }
        onValueChange={(v) =>
          editor.chain().focus().setFontSize(`${v}pt`).run()
        }
      >
        <SelectTrigger className="h-8 w-[4.5rem] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TAMANOS.map((t) => (
            <SelectItem key={t} value={t}>
              {t} pt
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separador />

      <Btn titulo="Negrita" activo={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold />
      </Btn>
      <Btn titulo="Cursiva" activo={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic />
      </Btn>
      <Btn titulo="Subrayado" activo={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon />
      </Btn>

      <Separador />

      <Btn titulo="Izquierda" activo={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
        <AlignLeft />
      </Btn>
      <Btn titulo="Centro" activo={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
        <AlignCenter />
      </Btn>
      <Btn titulo="Derecha" activo={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
        <AlignRight />
      </Btn>
      <Btn titulo="Justificado" activo={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
        <AlignJustify />
      </Btn>

      <Separador />

      <Btn titulo="Lista" activo={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List />
      </Btn>
      <Btn titulo="Lista numerada" activo={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered />
      </Btn>
      <Btn
        titulo="Insertar tabla"
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        <TableIcon />
      </Btn>

      <Separador />

      <Select
        defaultValue="1.5"
        onValueChange={(v) => {
          editor.chain().focus().setLineHeight(v).run();
          document.documentElement.style.setProperty('--interlineado', v);
        }}
      >
        <SelectTrigger className="h-8 w-[8.5rem] text-xs">
          <SelectValue placeholder="Interlineado" />
        </SelectTrigger>
        <SelectContent>
          {INTERLINEADOS.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              Interlin. {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separador />

      <Btn titulo="Deshacer" onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 />
      </Btn>
      <Btn titulo="Rehacer" onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 />
      </Btn>
    </div>
  );
}

function Separador() {
  return <span className="mx-1 h-6 w-px bg-border" />;
}
