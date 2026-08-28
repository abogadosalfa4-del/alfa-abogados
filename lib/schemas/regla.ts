import { z } from 'zod';

export const reglaSchema = z.object({
  nombre: z.string().trim().min(1).max(200),
  actuacionTrigger: z.string().trim().min(1).max(200),
  tipoProceso: z.enum([
    'ordinario',
    'sumario',
    'ejecutivo',
    'monitorio',
    'niñez',
    '*',
  ]),
  dias: z.coerce.number().int().min(0).max(365),
  tipoDias: z.enum(['habiles', 'calendario']),
  eventoTipo: z.enum(['escrito', 'audiencia', 'diligencia']).nullable().optional(),
  eventoTituloTemplate: z.string().trim().max(200).nullable().optional(),
  activo: z.boolean().default(true),
});
export type ReglaInput = z.infer<typeof reglaSchema>;

export const feriadoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  nombre: z.string().trim().min(1).max(120),
});
export type FeriadoInput = z.infer<typeof feriadoSchema>;
