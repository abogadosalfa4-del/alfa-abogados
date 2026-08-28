import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';

/** Extrae texto plano de un archivo del expediente (PLAN §6.3). */
export async function extraerTexto(buffer: Buffer, mime: string): Promise<string> {
  if (mime === 'application/pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  if (mime === 'text/plain' || mime === 'application/msword') {
    return buffer.toString('utf-8');
  }
  return '';
}
