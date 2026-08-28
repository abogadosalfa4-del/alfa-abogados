import { tool } from 'ai';
import { z } from 'zod';
import { buscarCausas, informacionJuicio } from '@/lib/sadje/client';
import { recuperar } from '@/lib/ai/rag';
import {
  consultarCalendario,
  consultarCausasOficina,
  consultarCorreos,
  consultarDocumentos,
  consultarExpediente,
  consultarTareas,
  leerDocumento,
  type ActorContexto,
} from '@/lib/ai/contexto-sistema';
import { env } from '@/lib/env';

/**
 * Tools del chat. El modelo las invoca bajo demanda para consultar
 * el sistema de la oficina y fuentes externas.
 */
export function toolsChat(opts: {
  causaId?: string | null;
  actor: ActorContexto;
}) {
  return {
    buscarCausasOficina: tool({
      description:
        'Busca causas en la base de datos local de Alfa Abogados por número de juicio, nombre de cliente o materia.',
      inputSchema: z.object({
        consulta: z
          .string()
          .min(1)
          .describe('Número de juicio, nombre de cliente, materia o texto libre'),
      }),
      execute: async ({ consulta }) => consultarCausasOficina(consulta),
    }),

    consultarExpediente: tool({
      description:
        'Obtiene el expediente completo de una causa: partes, actuaciones recientes, eventos pendientes y archivos. Usá el id de causa o el número de juicio.',
      inputSchema: z.object({
        idOCNumero: z
          .string()
          .min(3)
          .describe('UUID de la causa o número de juicio (ej. 01333-2026-09535)'),
      }),
      execute: async ({ idOCNumero }) => consultarExpediente(idOCNumero),
    }),

    consultarCalendario: tool({
      description:
        'Lista eventos del calendario (escritos, audiencias, diligencias) en un rango de fechas.',
      inputSchema: z.object({
        desde: z
          .string()
          .optional()
          .describe('Fecha inicio YYYY-MM-DD; por defecto hoy'),
        hasta: z
          .string()
          .optional()
          .describe('Fecha fin YYYY-MM-DD; por defecto 30 días desde inicio'),
      }),
      execute: async ({ desde, hasta }) => consultarCalendario(desde, hasta),
    }),

    consultarTareas: tool({
      description:
        'Lista tareas del tablero kanban de la oficina, con filtros opcionales.',
      inputSchema: z.object({
        columna: z
          .enum(['por_hacer', 'en_proceso', 'terminada'])
          .optional()
          .describe('Filtrar por columna del tablero'),
        soloMias: z
          .boolean()
          .optional()
          .describe('Solo tareas asignadas al usuario actual'),
        causaId: z.string().optional().describe('Filtrar por id de causa'),
      }),
      execute: async ({ columna, soloMias, causaId }) =>
        consultarTareas({
          columna,
          soloMias,
          causaId,
          actor: opts.actor,
        }),
    }),

    consultarDocumentos: tool({
      description:
        'Lista documentos jurídicos de la oficina (borradores, enviados, aprobados).',
      inputSchema: z.object({
        causaId: z.string().optional(),
        estado: z.enum(['borrador', 'enviado', 'aprobado']).optional(),
        limite: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (input) => consultarDocumentos(input),
    }),

    leerDocumento: tool({
      description:
        'Lee el contenido de texto de un documento del editor colaborativo por su id.',
      inputSchema: z.object({
        documentoId: z.string().min(1).describe('UUID del documento'),
      }),
      execute: async ({ documentoId }) => leerDocumento(documentoId),
    }),

    consultarCorreos: tool({
      description:
        'Lista correos importados del casillero judicial o lee uno completo por id.',
      inputSchema: z.object({
        soloNoLeidos: z.boolean().optional(),
        limite: z.number().int().min(1).max(50).optional(),
        correoId: z
          .string()
          .optional()
          .describe('Si se indica, devuelve el cuerpo completo de ese correo'),
      }),
      execute: async (input) => consultarCorreos(input),
    }),

    buscarCausaSadje: tool({
      description:
        'Consulta una causa judicial en e-SATJE (Función Judicial de Ecuador) por número de juicio y devuelve partes, materia y judicatura.',
      inputSchema: z.object({
        numeroJuicio: z
          .string()
          .min(13)
          .describe('Número de juicio, con o sin guiones: 01333-2026-09535 o 01333202609535'),
      }),
      execute: async ({ numeroJuicio }) => {
        try {
          const encontradas = await buscarCausas({ numeroCausa: numeroJuicio });
          const match =
            encontradas.find((c) => c.numeroJuicio === numeroJuicio) ??
            encontradas[0];
          if (!match) return { encontrada: false as const };
          const detalle = await informacionJuicio(match.idJuicio);
          return { encontrada: true as const, ...detalle };
        } catch (err) {
          return {
            encontrada: false as const,
            error: err instanceof Error ? err.message : 'e-SATJE no disponible',
          };
        }
      },
    }),

    buscarEnCodigos: tool({
      description:
        'Busca fragmentos relevantes en los códigos legales ecuatorianos y en los archivos del expediente en contexto. Úsalo cuando necesites el texto de una norma que no está en el contexto ya recuperado.',
      inputSchema: z.object({
        consulta: z.string().min(3).describe('Qué norma o tema buscar'),
      }),
      execute: async ({ consulta }) => {
        const frags = await recuperar(consulta, { causaId: opts.causaId, top: 6 });
        return {
          fragmentos: frags.map((f) => ({
            fuente: f.fuente,
            texto: f.contenido.slice(0, 1200),
          })),
        };
      },
    }),

    busquedaWeb: tool({
      description:
        'Búsqueda web general. Solo disponible si el administrador la habilitó.',
      inputSchema: z.object({ query: z.string().min(2) }),
      execute: async ({ query }) => {
        if (!env.WEB_SEARCH_ENABLED) {
          return {
            disponible: false as const,
            mensaje: 'La búsqueda web no está habilitada en este servidor.',
          };
        }
        return {
          disponible: false as const,
          mensaje: `Búsqueda web pendiente de configurar un proveedor. Consulta: ${query}`,
        };
      },
    }),
  };
}
