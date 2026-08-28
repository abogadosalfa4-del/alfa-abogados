import { z } from 'zod';

/**
 * Schemas Zod de eventos del calendario (PLAN §4.2). Compartidos entre el route
 * handler, el formulario del cliente y los emisores de socket.
 */

export const TIPOS_EVENTO = ['escrito', 'audiencia', 'diligencia'] as const;
export const ESTADOS_EVENTO = ['pendiente', 'cumplido', 'cancelado'] as const;

const fechaYmd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato YYYY-MM-DD');
const horaHm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora con formato HH:mm');

export const eventoCreateSchema = z.object({
  tipo: z.enum(TIPOS_EVENTO),
  titulo: z.string().trim().min(1, 'El título es obligatorio').max(200),
  descripcion: z.string().trim().max(4000).optional().nullable(),
  fecha: fechaYmd,
  hora: horaHm.optional().nullable(),
  causaId: z
    .string({
      required_error: 'El evento debe tener un número de juicio',
      invalid_type_error: 'El evento debe tener un número de juicio',
    })
    .uuid('El evento debe tener un número de juicio'),
  clienteId: z.string().uuid().optional().nullable(),
});

export type EventoCreate = z.infer<typeof eventoCreateSchema>;

export const eventoUpdateSchema = eventoCreateSchema
  .partial()
  .extend({ estado: z.enum(ESTADOS_EVENTO).optional() });

export type EventoUpdate = z.infer<typeof eventoUpdateSchema>;

export const eventoRangoSchema = z
  .object({ desde: fechaYmd, hasta: fechaYmd })
  .refine(
    ({ desde, hasta }) => {
      const dias =
        (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
      return dias >= 0 && dias <= 62;
    },
    { message: 'El rango debe ser de 0 a 62 días' },
  );
