import { z } from 'zod';
import { SadjeSchemaError } from '@/lib/sadje/errors';

/**
 * Esquemas de las respuestas del API interno de e-SATJE (PLAN §5.2).
 *
 * IMPORTANTE: la Función Judicial cambia estos shapes sin aviso. Se usan campos
 * laxos y `passthrough`; si algo esencial falta, se lanza `SadjeSchemaError` y
 * la UI cae al flujo manual (§5.3).
 */

const laxString = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => (v == null ? '' : String(v)))
  .optional()
  .default('');

const laxId = z.union([z.string(), z.number()]).transform(String);

export const buscarCausasItemSchema = z
  .object({
    idJuicio: laxId,
    estadoActual: laxString,
    idMateria: laxString,
    nombreMateria: laxString,
    nombreDelito: laxString,
    idTipoAccion: laxString,
    nombreTipoAccion: laxString,
    idJudicatura: laxString,
    nombreJudicatura: laxString,
    fechaIngreso: laxString,
    numeroJuicio: z.string().optional().default(''),
  })
  .passthrough();

export const buscarCausasResponseSchema = z.union([
  z.array(buscarCausasItemSchema),
  z
    .object({ content: z.array(buscarCausasItemSchema) })
    .passthrough()
    .transform((o) => o.content),
]);

export const parteSchema = z
  .object({
    tipoParte: laxString,
    nombresApellidos: laxString,
    representadoPor: laxString,
  })
  .passthrough();

export const informacionJuicioItemSchema = z
  .object({
    idJuicio: laxId.optional(),
    numeroJuicio: z.string().optional().default(''),
    estadoActual: laxString,
    nombreEstadoJuicio: laxString,
    nombreMateria: laxString,
    nombreDelito: laxString,
    nombreTipoAccion: laxString,
    nombreJudicatura: laxString,
    fechaIngreso: laxString,
    actor: z.array(parteSchema).optional().default([]),
    demandado: z.array(parteSchema).optional().default([]),
  })
  .passthrough();

/** El portal actual devuelve un array; se acepta también un objeto suelto. */
export const informacionJuicioListaSchema = z.union([
  z.array(informacionJuicioItemSchema),
  informacionJuicioItemSchema.transform((o) => [o]),
]);

export const litiganteSchema = z
  .object({
    tipoLitigante: laxString,
    nombresLitigante: laxString,
    representadoPor: laxString,
  })
  .passthrough();

export const incidenteItemSchema = z
  .object({
    idIncidenteJudicatura: laxId,
    idMovimientoJuicioIncidente: laxId,
    incidente: z.union([z.string(), z.number()]).optional().default(0),
    lstLitiganteActor: z.array(litiganteSchema).optional().default([]),
    lstLitiganteDemandado: z.array(litiganteSchema).optional().default([]),
  })
  .passthrough();

export const judicaturaIncidenteSchema = z
  .object({
    idJudicatura: laxString,
    nombreJudicatura: laxString,
    lstIncidenteJudicatura: z.array(incidenteItemSchema).optional().default([]),
  })
  .passthrough();

export const incidentesResponseSchema = z.array(judicaturaIncidenteSchema);
export type JudicaturaIncidente = z.infer<typeof judicaturaIncidenteSchema>;

export const actuacionSchema = z
  .object({
    codigo: z.union([z.string(), z.number()]).optional(),
    fecha: z.string().optional().default(''),
    tipo: laxString,
    actividad: laxString,
    detalle: laxString,
    nombreArchivo: laxString,
  })
  .passthrough();

export const actuacionesResponseSchema = z.union([
  z.array(actuacionSchema),
  z
    .object({ content: z.array(actuacionSchema) })
    .passthrough()
    .transform((o) => o.content),
]);

export function parseOrThrow<S extends z.ZodType>(
  schema: S,
  data: unknown,
  contexto: string,
): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new SadjeSchemaError(
      `Respuesta de e-SATJE con formato inesperado (${contexto}).`,
      r.error.issues.slice(0, 5),
    );
  }
  return r.data;
}
