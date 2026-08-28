import { and, desc, eq, isNull, like, or } from 'drizzle-orm';
import { handleErrors, ok, requireSession } from '@/lib/http';
import { db } from '@/lib/db';
import { causas, clientes } from '@/lib/db/schema';
import { esAbogadaOficina } from '@/lib/nombres';

/**
 * Fuente de datos para los combobox de "vincular causa / cliente" del
 * calendario y las tareas. Búsqueda local rápida (LIKE, case-insensitive).
 */
export function GET(req: Request) {
  return handleErrors(async () => {
    await requireSession();
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
    const patron = `%${q}%`;

    const clientesRows = db
      .select({ id: clientes.id, nombre: clientes.nombreCompleto, cedula: clientes.cedula })
      .from(clientes)
      .where(
        and(
          isNull(clientes.deletedAt),
          q
            ? or(like(clientes.nombreCompleto, patron), like(clientes.cedula, patron))
            : undefined,
        ),
      )
      .limit(20)
      .all();

    const causasRows = db
      .select({
        id: causas.id,
        numero: causas.numeroJuicio,
        materia: causas.materia,
        clienteId: causas.clienteId,
        clienteNombre: clientes.nombreCompleto,
      })
      .from(causas)
      .leftJoin(
        clientes,
        and(eq(clientes.id, causas.clienteId), isNull(clientes.deletedAt)),
      )
      .where(
        and(
          isNull(causas.deletedAt),
          q
            ? or(
                like(causas.numeroJuicio, patron),
                like(causas.materia, patron),
                like(clientes.nombreCompleto, patron),
              )
            : undefined,
        ),
      )
      .orderBy(desc(causas.createdAt))
      .limit(20)
      .all();

    return ok({
      clientes: clientesRows
        .filter((c) => !esAbogadaOficina(c.nombre))
        .map((c) => ({
          id: c.id,
          label: c.cedula ? `${c.nombre} · ${c.cedula}` : c.nombre,
        })),
      causas: causasRows.map((c) => ({
        id: c.id,
        clienteId: c.clienteId,
        label: c.clienteNombre
          ? `${c.numero} · ${c.clienteNombre}`
          : c.materia
            ? `${c.numero} · ${c.materia}`
            : c.numero,
      })),
    });
  });
}
