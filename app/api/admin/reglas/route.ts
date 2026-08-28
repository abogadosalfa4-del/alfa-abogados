import { asc, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { handleErrors, ok, parseBody, requireRole } from '@/lib/http';
import { db } from '@/lib/db';
import { reglasPlazo } from '@/lib/db/schema';
import { audit } from '@/lib/audit';
import { reglaSchema } from '@/lib/schemas/regla';
import { seedReglasPlazo } from '@/lib/sadje/reglas-seed';
import { reconciliarEventosRegla } from '@/lib/sadje/deadlines';

export function GET() {
  return handleErrors(async () => {
    await requireRole('admin');
    return ok({
      reglas: db
        .select()
        .from(reglasPlazo)
        .where(isNull(reglasPlazo.deletedAt))
        .orderBy(asc(reglasPlazo.nombre))
        .all(),
    });
  });
}

export function POST(req: Request) {
  return handleErrors(async () => {
    const actor = await requireRole('admin');
    if (req.headers.get('X-Seed') === '1') {
      return ok({ insertadas: seedReglasPlazo() });
    }
    if (req.headers.get('X-Reconciliar') === '1') {
      return ok(reconciliarEventosRegla(actor.userId));
    }
    const input = await parseBody(req, reglaSchema);
    const id = uuidv7();
    const nowIso = new Date().toISOString();
    db.transaction((tx) => {
      tx.insert(reglasPlazo)
        .values({ ...input, id, createdAt: nowIso, updatedAt: nowIso })
        .run();
      audit(
        { userId: actor.userId, entidad: 'regla_plazo', entidadId: id, accion: 'create', diff: input },
        tx,
      );
    });
    return ok(
      { regla: db.select().from(reglasPlazo).where(eq(reglasPlazo.id, id)).get() },
      { status: 201 },
    );
  });
}
