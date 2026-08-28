import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { markdownATiptap } from '@/lib/ai/tiptap';

export interface SugerenciaIA {
  id: string;
  from: number;
  to: number;
  texto: string;
  modo: 'insertar' | 'reemplazar';
}

export interface SugerenciaIAPluginState {
  sugerencias: SugerenciaIA[];
}

export const sugerenciaIAKey = new PluginKey<SugerenciaIAPluginState>('sugerenciaIA');

function crearWidget(texto: string, id: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'sugerencia-ia-pendiente';
  el.dataset.sugerenciaId = id;
  el.textContent = texto;
  return el;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sugerenciaIA: {
      establecerSugerenciaIA: (sugerencia: SugerenciaIA) => ReturnType;
      aceptarSugerenciaIA: () => ReturnType;
      rechazarSugerenciaIA: () => ReturnType;
    };
  }
}

/**
 * Sugerencias de IA locales (no se sincronizan por Yjs hasta aceptar).
 * Muestra texto fantasma en color/atenuado; Tab acepta, Esc rechaza.
 */
export const SugerenciaIA = Extension.create({
  name: 'sugerenciaIA',

  addStorage() {
    return {
      sugerencias: [] as SugerenciaIA[],
    };
  },

  addCommands() {
    return {
      establecerSugerenciaIA:
        (sugerencia: SugerenciaIA) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(sugerenciaIAKey, { sugerencias: [sugerencia] });
            dispatch(tr);
          }
          return true;
        },

      aceptarSugerenciaIA:
        () =>
        ({ editor, state }) => {
          const pluginState = sugerenciaIAKey.getState(state);
          if (!pluginState?.sugerencias.length) return false;

          const s = pluginState.sugerencias[0]!;
          const pm = markdownATiptap(s.texto);
          const contenido = pm.content?.length
            ? pm.content
            : [{ type: 'paragraph', content: [{ type: 'text', text: s.texto || ' ' }] }];

          editor.view.dispatch(state.tr.setMeta(sugerenciaIAKey, { sugerencias: [] }));

          if (s.modo === 'reemplazar' && s.to > s.from) {
            editor
              .chain()
              .focus()
              .deleteRange({ from: s.from, to: s.to })
              .insertContentAt(s.from, contenido)
              .run();
          } else {
            editor.chain().focus().insertContentAt(s.from, contenido).run();
          }

          return true;
        },

      rechazarSugerenciaIA:
        () =>
        ({ tr, dispatch, state }) => {
          const pluginState = sugerenciaIAKey.getState(state);
          if (!pluginState?.sugerencias.length) return false;
          if (dispatch) {
            tr.setMeta(sugerenciaIAKey, { sugerencias: [] });
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const n = sugerenciaIAKey.getState(this.editor.state)?.sugerencias.length ?? 0;
        if (!n) return false;
        return this.editor.commands.aceptarSugerenciaIA();
      },
      Escape: () => {
        const n = sugerenciaIAKey.getState(this.editor.state)?.sugerencias.length ?? 0;
        if (!n) return false;
        return this.editor.commands.rechazarSugerenciaIA();
      },
    };
  },

  onTransaction({ transaction }) {
    const meta = transaction.getMeta(sugerenciaIAKey) as
      | { sugerencias?: SugerenciaIA[] }
      | undefined;
    if (meta?.sugerencias !== undefined) {
      this.storage.sugerencias = meta.sugerencias;
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SugerenciaIAPluginState>({
        key: sugerenciaIAKey,
        state: {
          init(): SugerenciaIAPluginState {
            return { sugerencias: [] };
          },
          apply(tr: Transaction, value: SugerenciaIAPluginState): SugerenciaIAPluginState {
            const meta = tr.getMeta(sugerenciaIAKey) as
              | { sugerencias?: SugerenciaIA[] }
              | undefined;
            if (meta?.sugerencias !== undefined) {
              return { sugerencias: meta.sugerencias };
            }
            if (!value.sugerencias.length || !tr.docChanged) return value;
            return {
              sugerencias: value.sugerencias.map((s) => ({
                ...s,
                from: tr.mapping.map(s.from),
                to: tr.mapping.map(s.to),
              })),
            };
          },
        },
        props: {
          decorations(state: EditorState) {
            const pluginState = sugerenciaIAKey.getState(state);
            if (!pluginState?.sugerencias.length) return DecorationSet.empty;

            const decos: Decoration[] = [];
            for (const s of pluginState.sugerencias) {
              if (s.modo === 'reemplazar' && s.to > s.from) {
                decos.push(
                  Decoration.inline(s.from, s.to, {
                    class: 'sugerencia-ia-original',
                  }),
                );
              }
              const pos = s.modo === 'reemplazar' && s.to > s.from ? s.to : s.from;
              decos.push(
                Decoration.widget(pos, () => crearWidget(s.texto, s.id), {
                  side: 1,
                  key: `sug-${s.id}`,
                }),
              );
            }
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
