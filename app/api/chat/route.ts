import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai';
import { handleErrors, requireSession } from '@/lib/http';
import { IA_DISPONIBLE, modeloChat } from '@/lib/ai/gemini';
import { NO_IA_MENSAJE, SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { recuperar } from '@/lib/ai/rag';
import { fichaCausa } from '@/lib/ai/contexto';
import { contextoSistemaResumen } from '@/lib/ai/contexto-sistema';
import { toolsChat } from '@/lib/ai/tools';
import {
  guardarMensajes,
  obtenerConversacion,
} from '@/lib/ai/conversaciones';

export const maxDuration = 120;

function textoDe(msg: UIMessage | undefined): string {
  if (!msg) return '';
  return (msg.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ');
}

export function POST(req: Request) {
  return handleErrors(async () => {
    const actor = await requireSession();
    const body = (await req.json()) as {
      messages: UIMessage[];
      conversacionId?: string;
      causaId?: string | null;
    };
    const { messages, conversacionId } = body;
    const causaId = body.causaId ?? null;

    if (!IA_DISPONIBLE) {
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          const id = crypto.randomUUID();
          writer.write({ type: 'text-start', id });
          writer.write({ type: 'text-delta', id, delta: NO_IA_MENSAJE });
          writer.write({ type: 'text-end', id });
        },
      });
      return createUIMessageStreamResponse({ stream });
    }

    // 1. Recuperación RAG sobre la última pregunta del usuario (§6.2).
    const pregunta = textoDe([...messages].reverse().find((m) => m.role === 'user'));
    const fragmentos = pregunta ? await recuperar(pregunta, { causaId, top: 8 }) : [];

    // 2. Ficha de la causa en contexto + panorama del sistema.
    const ficha = causaId ? fichaCausa(causaId) : null;
    const sistema = contextoSistemaResumen({
      userId: actor.userId,
      role: actor.role,
      userName: actor.session.user.name,
    });

    const contexto = [
      sistema,
      fragmentos.length
        ? `## Contexto normativo recuperado (citá SOLO desde aquí)\n${fragmentos
            .map((f, i) => `[${i + 1}] Fuente: ${f.fuente}\n${f.contenido}`)
            .join('\n\n---\n\n')}`
        : '## Contexto normativo recuperado\n(no se recuperó ninguna norma; decilo explícitamente si te piden citar)',
      ficha ?? '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const fuentes = fragmentos.map((f) => ({ fuente: f.fuente, tipo: f.fuenteTipo }));

    const result = streamText({
      model: modeloChat(),
      system: `${SYSTEM_PROMPT}\n\n${contexto}`,
      messages: await convertToModelMessages(messages),
      tools: toolsChat({
        causaId,
        actor: {
          userId: actor.userId,
          role: actor.role,
          userName: actor.session.user.name,
        },
      }),
      stopWhen: stepCountIs(6),
      maxOutputTokens: 8000,
      temperature: 0.3,
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      messageMetadata: ({ part }) =>
        part.type === 'start' ? { fuentes } : undefined,
      onFinish: ({ messages: finales }) => {
        if (conversacionId && obtenerConversacion(conversacionId, actor.userId)) {
          guardarMensajes(
            conversacionId,
            finales.map((m) => ({ role: m.role, parts: m.parts })),
          );
        }
      },
      onError: (err) =>
        err instanceof Error ? err.message : 'Error del modelo. Intentá de nuevo.',
    });
  });
}
