import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reglasPlazo } from '@/lib/db/schema';

/**
 * Seed de reglas de plazo (PLAN §5.4.1). Los días son los defaults documentados
 * como "verificar con COGEP vigente"; el admin los ajusta en /admin/reglas.
 */
export const REGLAS_DEFECTO: Omit<
  typeof reglasPlazo.$inferInsert,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
>[] = [
  {
    nombre: 'Contestación demanda (ordinario)',
    actuacionTrigger: 'CITACION',
    tipoProceso: 'ordinario',
    dias: 30,
    tipoDias: 'habiles',
    eventoTipo: 'escrito',
    eventoTituloTemplate: 'Vence contestación demanda — {cliente}',
    activo: true,
  },
  {
    nombre: 'Contestación demanda (sumario)',
    actuacionTrigger: 'CITACION',
    tipoProceso: 'sumario',
    dias: 15,
    tipoDias: 'habiles',
    eventoTipo: 'escrito',
    eventoTituloTemplate: 'Vence contestación (sumario) — {cliente}',
    activo: true,
  },
  {
    nombre: 'Contestación demanda (ejecutivo)',
    actuacionTrigger: 'CITACION',
    tipoProceso: 'ejecutivo',
    dias: 15,
    tipoDias: 'habiles',
    eventoTipo: 'escrito',
    eventoTituloTemplate: 'Vence contestación (ejecutivo) — {cliente}',
    activo: true,
  },
  {
    nombre: 'Convocatoria a audiencia',
    actuacionTrigger: 'AUDIENCIA',
    tipoProceso: '*',
    dias: 0,
    tipoDias: 'habiles',
    eventoTipo: 'audiencia',
    eventoTituloTemplate: 'Audiencia — {cliente}',
    activo: true,
  },
  {
    nombre: 'Término de apelación (sentencia)',
    actuacionTrigger: 'SENTENCIA',
    tipoProceso: '*',
    dias: 10,
    tipoDias: 'habiles',
    eventoTipo: 'escrito',
    eventoTituloTemplate: 'Vence término apelación — {cliente}',
    activo: true,
  },
  {
    nombre: 'Término de recurso (auto interlocutorio)',
    actuacionTrigger: 'AUTO INTERLOCUTORIO',
    tipoProceso: '*',
    dias: 3,
    tipoDias: 'habiles',
    eventoTipo: 'escrito',
    eventoTituloTemplate: 'Vence término recurso — {cliente}',
    activo: true,
  },
];

/** Idempotente: siembra las reglas por defecto que aún no existan (por nombre). */
export function seedReglasPlazo(): number {
  let insertadas = 0;
  db.transaction((tx) => {
    for (const r of REGLAS_DEFECTO) {
      const existe = tx
        .select({ id: reglasPlazo.id })
        .from(reglasPlazo)
        .where(eq(reglasPlazo.nombre, r.nombre))
        .get();
      if (!existe) {
        const nowIso = new Date().toISOString();
        tx.insert(reglasPlazo)
          .values({ ...r, id: uuidv7(), createdAt: nowIso, updatedAt: nowIso })
          .run();
        insertadas++;
      }
    }
  });
  return insertadas;
}
