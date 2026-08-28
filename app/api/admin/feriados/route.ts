import { asc, eq } from 'drizzle-orm';
import { handleErrors, ok, parseBody, requireRole } from '@/lib/http';
import { db } from '@/lib/db';
import { feriados } from '@/lib/db/schema';
import { audit } from '@/lib/audit';
import { feriadoSchema } from '@/lib/schemas/regla';
import { invalidarCacheFeriados, seedFeriados } from '@/lib/feriados';

export function GET() {
  return handleErrors(async () => {
    await requireRole('admin');
    return ok({
      feriados: db.select().from(feriados).orderBy(asc(feriados.fecha)).all(),
    });
  });
}

export function POST(req: Request) {
  return handleErrors(async () => {
    const actor = await requireRole('admin');
    if (req.headers.get('X-Seed') === '1') {
      const insertados = seedFeriados();
      invalidarCacheFeriados();
      return ok({ insertados });
    }
    const input = await parseBody(req, feriadoSchema);
    db.transaction((tx) => {
      tx.insert(feriados)
        .values(input)
        .onConflictDoUpdate({ target: feriados.fecha, set: { nombre: input.nombre } })
        .run();
      audit(
        { userId: actor.userId, entidad: 'feriado', entidadId: input.fecha, accion: 'create', diff: input },
        tx,
      );
    });
    invalidarCacheFeriados();
    return ok({ feriado: input }, { status: 201 });
  });
}

export function DELETE(req: Request) {
  return handleErrors(async () => {
    const actor = await requireRole('admin');
    const fecha = new URL(req.url).searchParams.get('fecha');
    if (!fecha) return ok({ ok: false });
    db.transaction((tx) => {
      tx.delete(feriados).where(eq(feriados.fecha, fecha)).run();
      audit({ userId: actor.userId, entidad: 'feriado', entidadId: fecha, accion: 'delete' }, tx);
    });
    invalidarCacheFeriados();
    return ok({ ok: true });
  });
}
