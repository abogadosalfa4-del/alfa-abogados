import { generateObject } from 'ai';
import { z } from 'zod';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientes, correosResumen } from '@/lib/db/schema';
import { hoyISO } from '@/lib/fechas';
import { log } from '@/lib/logger';
import { IA_DISPONIBLE, modeloChat } from '@/lib/ai/gemini';
import { traerMensajes, type MensajeGraph } from '@/lib/outlook/graph';
import { extraerNumeroJuicio } from '@/lib/extraer-fecha';

const logger = log('correos');

export const resumenSchema = z.object({
  grupos: z.array(
    z.object({
      categoria: z.string(),
      cantidad: z.number(),
      correos: z.array(
        z.object({
          asunto: z.string(),
          remitente: z.string(),
          resumen_1_linea: z.string(),
          requiere_accion: z.boolean(),
          numero_juicio: z.string().optional(),
        }),
      ),
    }),
  ),
});
export type ResumenCorreos = z.infer<typeof resumenSchema>;

function categoriaPorRemitente(from: string, emailsClientes: Map<string, string>): string {
  const f = from.toLowerCase();
  if (f.endsWith('@funcionjudicial.gob.ec') || f.includes('funcionjudicial')) return 'SADJE';
  if (f.includes('fiscalia.gob.ec')) return 'Fiscalía';
  const cliente = emailsClientes.get(f);
  if (cliente) return `Cliente ${cliente}`;
  return 'Otros';
}

function agrupar(mensajes: MensajeGraph[]): ResumenCorreos {
  const emailsClientes = new Map(
    db
      .select({ email: clientes.email, nombre: clientes.nombreCompleto })
      .from(clientes)
      .where(and(isNotNull(clientes.email)))
      .all()
      .map((c) => [String(c.email).toLowerCase(), c.nombre] as const),
  );

  const porCat = new Map<string, MensajeGraph[]>();
  for (const m of mensajes) {
    const cat = categoriaPorRemitente(m.from, emailsClientes);
    porCat.set(cat, [...(porCat.get(cat) ?? []), m]);
  }

  return {
    grupos: [...porCat.entries()].map(([categoria, correos]) => ({
      categoria,
      cantidad: correos.length,
      correos: correos.map((c) => ({
        asunto: c.subject,
        remitente: c.from,
        resumen_1_linea: c.bodyPreview.slice(0, 140),
        requiere_accion: /audiencia|termino|contestar|plazo|urgente|notifica/i.test(
          `${c.subject} ${c.bodyPreview}`,
        ),
        numero_juicio: extraerNumeroJuicio(`${c.subject} ${c.bodyPreview}`) ?? undefined,
      })),
    })),
  };
}

/**
 * Resumen agrupado del buzón (PLAN §9.2). Paso 1: dominio del remitente.
 * Paso 2: una llamada a Gemini (`generateObject`) para el resumen fino.
 * Cachea por fecha en `correos_resumen`.
 */
export async function generarResumen(
  userId: string,
  opts: { forzar?: boolean } = {},
): Promise<ResumenCorreos> {
  const fecha = hoyISO();

  if (!opts.forzar) {
    const cache = db
      .select()
      .from(correosResumen)
      .where(eq(correosResumen.fecha, fecha))
      .orderBy(desc(correosResumen.generadoAt))
      .get();
    if (cache) return cache.resumenJson as ResumenCorreos;
  }

  const mensajes = await traerMensajes(userId);
  const base = agrupar(mensajes);

  let resultado = base;
  if (IA_DISPONIBLE && mensajes.length > 0) {
    try {
      const { object } = await generateObject({
        model: modeloChat(),
        schema: resumenSchema,
        prompt: `Resumí y clasificá estos correos de Alfa Abogados (despacho de abogados de Ecuador). Mantené las categorías dadas. Para cada correo: un resumen de 1 línea en español, si requiere acción, y el número de juicio si aparece (formato 00000-0000-00000).\n\n${JSON.stringify(
          base.grupos.map((g) => ({
            categoria: g.categoria,
            correos: g.correos.map((c) => ({ asunto: c.asunto, remitente: c.remitente, preview: c.resumen_1_linea })),
          })),
        )}`,
      });
      resultado = object;
    } catch (err) {
      logger.warn({ err }, 'generateObject de correos falló; se usa el agrupado base');
    }
  }

  db.insert(correosResumen)
    .values({
      id: crypto.randomUUID(),
      fecha,
      resumenJson: resultado as object,
      generadoAt: new Date().toISOString(),
    })
    .run();

  return resultado;
}
