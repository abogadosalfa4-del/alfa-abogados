import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

/**
 * Conversión del snapshot Tiptap (JSON de ProseMirror) a .docx (PLAN §8.2).
 * Soporta párrafos, encabezados, negrita/cursiva/subrayado, alineación,
 * fuente y tamaño, listas y tablas simples.
 */

interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

const ALIN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

const NIVEL: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
};

function runsDe(node: PMNode): TextRun[] {
  if (!node.content) return [new TextRun('')];
  const runs: TextRun[] = [];
  for (const hijo of node.content) {
    if (hijo.type !== 'text' || !hijo.text) {
      if (hijo.type === 'hardBreak') runs.push(new TextRun({ text: '', break: 1 }));
      continue;
    }
    const marks = hijo.marks ?? [];
    const style = marks.find((m) => m.type === 'textStyle')?.attrs ?? {};
    const fontSizePt = parseInt(String(style.fontSize ?? ''), 10);
    runs.push(
      new TextRun({
        text: hijo.text,
        bold: marks.some((m) => m.type === 'bold'),
        italics: marks.some((m) => m.type === 'italic'),
        underline: marks.some((m) => m.type === 'underline') ? {} : undefined,
        strike: marks.some((m) => m.type === 'strike'),
        font: typeof style.fontFamily === 'string' ? style.fontFamily : undefined,
        size: Number.isFinite(fontSizePt) ? fontSizePt * 2 : undefined, // half-points
      }),
    );
  }
  return runs.length ? runs : [new TextRun('')];
}

function parrafo(node: PMNode, extra?: { bullet?: { level: number }; numbering?: { reference: string; level: number } }): Paragraph {
  const align = ALIN[String(node.attrs?.textAlign ?? 'left')];
  return new Paragraph({
    children: runsDe(node),
    alignment: align,
    bullet: extra?.bullet,
    numbering: extra?.numbering,
  });
}

function bloquesDe(nodes: PMNode[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph':
        out.push(parrafo(node));
        break;
      case 'heading': {
        const lvl = Number(node.attrs?.level ?? 1);
        out.push(
          new Paragraph({
            children: runsDe(node),
            heading: NIVEL[lvl] ?? HeadingLevel.HEADING_2,
            alignment: ALIN[String(node.attrs?.textAlign ?? 'left')],
          }),
        );
        break;
      }
      case 'bulletList':
        for (const li of node.content ?? []) {
          for (const p of li.content ?? []) {
            out.push(parrafo(p, { bullet: { level: 0 } }));
          }
        }
        break;
      case 'orderedList':
        for (const li of node.content ?? []) {
          for (const p of li.content ?? []) {
            out.push(parrafo(p, { numbering: { reference: 'num', level: 0 } }));
          }
        }
        break;
      case 'blockquote':
        for (const p of node.content ?? []) out.push(parrafo(p));
        break;
      case 'table':
        out.push(tabla(node));
        break;
      default:
        if (node.content) out.push(...bloquesDe(node.content));
    }
  }
  return out;
}

function tabla(node: PMNode): Table {
  const filas = (node.content ?? []).map(
    (fila) =>
      new TableRow({
        children: (fila.content ?? []).map(
          (celda) =>
            new TableCell({
              children: (celda.content ?? []).map((p) => parrafo(p)),
              width: { size: 100 / Math.max(1, (fila.content ?? []).length), type: WidthType.PERCENTAGE },
            }),
        ),
      }),
  );
  return new Table({ rows: filas, width: { size: 100, type: WidthType.PERCENTAGE } });
}

export async function jsonADocx(
  snapshot: unknown,
  titulo: string,
): Promise<Buffer> {
  const doc = snapshot as PMNode | null;
  const children = doc?.content?.length
    ? bloquesDe(doc.content)
    : [new Paragraph('(documento vacío)')];

  const documento = new Document({
    numbering: {
      config: [
        {
          reference: 'num',
          levels: [
            { level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ text: titulo, heading: HeadingLevel.TITLE }),
          ...children,
        ],
      },
    ],
  });

  return Packer.toBuffer(documento);
}
