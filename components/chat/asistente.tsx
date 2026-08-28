'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Loader2, Plus, Send, Square, Trash2, MessagesSquare } from 'lucide-react';
import { toast } from 'sonner';
import { apiMutate, fetcher } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Mensaje } from '@/components/chat/mensaje';

interface Conversacion {
  id: string;
  titulo: string;
  causaId: string | null;
}
interface CausaOpt {
  id: string;
  label: string;
}

const ACCIONES = [
  { label: 'Redactar contestación de demanda', prompt: 'Redactá una contestación de demanda para la causa en contexto, con la estructura forense ecuatoriana.' },
  { label: 'Redactar demanda', prompt: 'Redactá una demanda conforme al COGEP para la causa en contexto.' },
  { label: 'Analizar expediente', prompt: 'Analizá el expediente en contexto: estado procesal, plazos corriendo y próximos pasos recomendados.' },
];

export function Asistente({ iaDisponible }: { iaDisponible: boolean }) {
  const [convId, setConvId] = useState<string | null>(null);
  const [causaId, setCausaId] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [iniciales, setIniciales] = useState<UIMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: convData, mutate: mutateConvs } = useSWR<{ conversaciones: Conversacion[] }>(
    '/api/conversaciones',
    fetcher,
  );
  const { data: causasData } = useSWR<{ causas: { id: string; label: string }[] }>(
    '/api/vinculos',
    fetcher,
  );

  const { messages, sendMessage, status, setMessages, stop, error, clearError } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    messages: iniciales,
    onError: (err) => {
      toast.error(err.message || 'No se pudo conectar con el asistente. Revisá que el servidor esté corriendo.');
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function abrirConversacion(id: string) {
    if (status === 'streaming' || status === 'submitted') stop();
    clearError();
    setConvId(id);
    try {
      const r = await fetcher<{
        conversacion: { causaId: string | null };
        mensajes: { id: string; role: string; parts: unknown }[];
      }>(`/api/conversaciones/${id}`);
      setCausaId(r.conversacion.causaId);
      const msgs = r.mensajes.map((m) => ({
        id: m.id,
        role: m.role as UIMessage['role'],
        parts: m.parts as UIMessage['parts'],
      }));
      setIniciales(msgs);
      setMessages(msgs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo abrir la conversación');
    }
  }

  async function nuevaConversacion() {
    const { conversacion } = await apiMutate<{ conversacion: Conversacion }>(
      '/api/conversaciones',
      'POST',
      { causaId },
    );
    await mutateConvs();
    setConvId(conversacion.id);
    setMessages([]);
    setIniciales([]);
  }

  async function borrar(id: string) {
    await apiMutate(`/api/conversaciones/${id}`, 'DELETE');
    if (convId === id) {
      setConvId(null);
      setMessages([]);
    }
    void mutateConvs();
  }

  async function enviar(contenido: string) {
    const txt = contenido.trim();
    if (!txt) return;
    if (status === 'streaming' || status === 'submitted') stop();
    clearError();

    let cid = convId;
    try {
      if (!cid) {
        const { conversacion } = await apiMutate<{ conversacion: Conversacion }>(
          '/api/conversaciones',
          'POST',
          { titulo: txt.slice(0, 60), causaId },
        );
        cid = conversacion.id;
        setConvId(cid);
        void mutateConvs();
      }
      setTexto('');
      await sendMessage({ text: txt }, { body: { conversacionId: cid, causaId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar el mensaje');
    }
  }

  const cargando = status === 'streaming' || status === 'submitted';

  return (
    <div className="flex h-full min-h-0 flex-1">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-card">
        <div className="border-b p-2">
          <Button size="sm" className="w-full" onClick={nuevaConversacion}>
            <Plus className="size-4" /> Nueva conversación
          </Button>
        </div>
        <ul className="flex-1 overflow-auto p-1">
          {(convData?.conversaciones ?? []).map((c) => (
            <li key={c.id} className="group flex items-center">
              <button
                type="button"
                onClick={() => abrirConversacion(c.id)}
                className={cn(
                  'flex-1 truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent',
                  convId === c.id && 'bg-accent font-medium',
                )}
              >
                {c.titulo}
              </button>
              <button
                type="button"
                onClick={() => borrar(c.id)}
                className="p-1 opacity-0 group-hover:opacity-100"
                aria-label="Eliminar"
              >
                <Trash2 className="size-3.5 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">Contexto:</span>
          <Select
            value={causaId ?? 'ninguno'}
            onValueChange={(v) => setCausaId(v === 'ninguno' ? null : v)}
          >
            <SelectTrigger className="h-8 w-64 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ninguno">Ninguno</SelectItem>
              {(causasData?.causas ?? []).map((c: CausaOpt) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!iaDisponible && (
            <span className="ml-auto text-xs text-warning-foreground">
              IA no configurada (falta GEMINI_API_KEY)
            </span>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-auto p-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <MessagesSquare className="size-8" />
              <p className="text-sm">Preguntá sobre plazos, normas o pedí que redacte un escrito.</p>
            </div>
          )}
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.message}
            </div>
          )}
          {messages.map((m) => (
            <Mensaje key={m.id} mensaje={m} causaId={causaId} />
          ))}
          {cargando && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Redactando…
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => stop()}>
                <Square className="mr-1 size-3" /> Detener
              </Button>
            </div>
          )}
        </div>

        <div className="border-t bg-card p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {ACCIONES.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => enviar(a.prompt)}
                disabled={cargando}
                className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enviar(texto);
            }}
            className="flex items-end gap-2"
          >
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void enviar(texto);
                }
              }}
              placeholder="Escribí tu consulta…"
              className="min-h-[44px] resize-none"
              rows={1}
            />
            <Button type="submit" size="icon" disabled={cargando || !texto.trim()}>
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
