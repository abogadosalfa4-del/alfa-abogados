import { generateText } from 'ai';
import { IA_DISPONIBLE, modeloChat } from '@/lib/ai/gemini';
import { fichaCausa } from '@/lib/ai/contexto';
import { contextoSistemaResumen, type ActorContexto } from '@/lib/ai/contexto-sistema';

export const SUGERIR_NO_IA =
  'La asistencia de redacción no está disponible. Configure GEMINI_API_KEY en el servidor.';

export interface SugerirDocumentoInput {
  instruccion: string;
  tituloDocumento: string;
  textoDocumento: string;
  textoSeleccion?: string;
  causaId?: string | null;
  actor: ActorContexto;
}

export interface SugerirDocumentoResultado {
  texto: string;
  modo: 'insertar' | 'reemplazar';
}

export async function sugerirTextoDocumento(
  input: SugerirDocumentoInput,
): Promise<SugerirDocumentoResultado> {
  if (!IA_DISPONIBLE) {
    throw new Error(SUGERIR_NO_IA);
  }

  const sistema = contextoSistemaResumen(input.actor);
  const ficha = input.causaId ? fichaCausa(input.causaId) : '';
  const haySeleccion = Boolean(input.textoSeleccion?.trim());
  const modo: 'insertar' | 'reemplazar' = haySeleccion ? 'reemplazar' : 'insertar';

  const { text } = await generateText({
    model: modeloChat(),
    temperature: 0.35,
    maxOutputTokens: 4000,
    system: `Eres el asistente de redacción forense de Alfa Abogados (Cuenca, Ecuador).
Redactás en español ecuatoriano, tono profesional, estructura forense cuando corresponda.
Tenés acceso al contexto del sistema de la oficina (causas, calendario, tareas, correos).
Respondés ÚNICAMENTE con el texto sugerido para el documento — sin explicaciones, sin comillas envolventes, sin markdown de código.`,
    prompt: [
      `## Documento en edición`,
      `Título: ${input.tituloDocumento}`,
      '',
      '### Contenido actual',
      input.textoDocumento.slice(-12000) || '(documento vacío)',
      '',
      haySeleccion
        ? `### Texto seleccionado (reemplazar/mejorar)\n${input.textoSeleccion!.slice(0, 4000)}`
        : '### Cursor: continuar o insertar al final del contenido mostrado',
      '',
      `## Instrucción del usuario\n${input.instruccion.trim()}`,
      '',
      '## Contexto del sistema de la oficina',
      sistema,
      ficha ? `\n## Causa vinculada\n${ficha}` : '',
      '',
      modo === 'reemplazar'
        ? 'Generá el texto que debe REEMPLAZAR la selección.'
        : 'Generá el texto que debe INSERTARSE a continuación (sin repetir párrafos ya escritos).',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const limpio = text
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();

  return { texto: limpio, modo };
}
