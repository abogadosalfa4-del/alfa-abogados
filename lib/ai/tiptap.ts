/**
 * Conversión Markdown → JSON de ProseMirror/Tiptap para "Abrir en editor"
 * (PLAN §6.1). Cubre lo habitual en escritos: encabezados, párrafos, negrita,
 * cursiva y listas.
 */

interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: { type: string }[];
  text?: string;
}

function inline(texto: string): PMNode[] {
  const nodes: PMNode[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    if (m.index > last) nodes.push({ type: 'text', text: texto.slice(last, m.index) });
    const bold = m[2] ?? m[3];
    const italic = m[4] ?? m[5];
    if (bold != null) nodes.push({ type: 'text', text: bold, marks: [{ type: 'bold' }] });
    else if (italic != null) nodes.push({ type: 'text', text: italic, marks: [{ type: 'italic' }] });
    last = re.lastIndex;
  }
  if (last < texto.length) nodes.push({ type: 'text', text: texto.slice(last) });
  return nodes.length ? nodes : [{ type: 'text', text: texto || ' ' }];
}

export function markdownATiptap(md: string): PMNode {
  const lineas = md.replace(/\r\n/g, '\n').split('\n');
  const content: PMNode[] = [];
  let listaBuffer: { tipo: 'bulletList' | 'orderedList'; items: PMNode[] } | null = null;

  const cerrarLista = () => {
    if (listaBuffer) {
      content.push({ type: listaBuffer.tipo, content: listaBuffer.items });
      listaBuffer = null;
    }
  };

  for (const raw of lineas) {
    const linea = raw.trimEnd();
    if (!linea.trim()) {
      cerrarLista();
      continue;
    }
    const h = linea.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      cerrarLista();
      content.push({
        type: 'heading',
        attrs: { level: h[1]!.length },
        content: inline(h[2]!),
      });
      continue;
    }
    const bullet = linea.match(/^[-*]\s+(.*)$/);
    const ordered = linea.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || ordered) {
      const tipo = bullet ? 'bulletList' : 'orderedList';
      if (!listaBuffer || listaBuffer.tipo !== tipo) {
        cerrarLista();
        listaBuffer = { tipo, items: [] };
      }
      listaBuffer.items.push({
        type: 'listItem',
        content: [{ type: 'paragraph', content: inline((bullet ?? ordered)![1]!) }],
      });
      continue;
    }
    cerrarLista();
    content.push({ type: 'paragraph', content: inline(linea) });
  }
  cerrarLista();

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

/** Extrae texto plano de un snapshot ProseMirror/Tiptap. */
export function textoDeTiptap(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as PMNode;
  if (typeof n.text === 'string') return n.text;
  if (!n.content?.length) {
    return n.type === 'paragraph' || n.type === 'heading' ? '\n' : '';
  }
  const partes = n.content.map(textoDeTiptap);
  if (n.type === 'doc') return partes.join('').trim();
  if (n.type === 'paragraph' || n.type === 'heading') return `${partes.join('')}\n`;
  if (n.type === 'listItem') return `- ${partes.join('').trim()}\n`;
  if (n.type === 'bulletList' || n.type === 'orderedList') return partes.join('');
  return partes.join('');
}
