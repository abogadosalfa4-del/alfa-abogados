import { eq } from 'drizzle-orm';
import { errores, handleErrors, ok, parseBody, requireRole } from '@/lib/http';
import { db } from '@/lib/db';
import { reglasPlazo } from '@/lib/db/schema';
import { audit, computeDiff } from '@/lib/audit';
import { reglaSchema } from '@/lib/schemas/regla';

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireRole('admin');
    const { id } = await ctx.params;
    const actual = db.select().from(reglasPlazo).where(eq(reglasPlazo.id, id)).get();
    if (!actual) throw errores.noEncontrado('regla');
    const input = await parseBody(req, reglaSchema.partial());
    const nowIso = new Date().toISOString();
    db.transaction((tx) => {
      tx.update(reglasPlazo).set({ ...input, updatedAt: nowIso }).where(eq(reglasPlazo.id, id)).run();
      audit(
        { userId: actor.userId, entidad: 'regla_plazo', entidadId: id, accion: 'update', diff: computeDiff(actual as Record<string, unknown>, input) },
        tx,
      );
    });
    return ok({ regla: db.select().from(reglasPlazo).where(eq(reglasPlazo.id, id)).get() });
  });
}

export function DELETE(_req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireRole('admin');
    const { id } = await ctx.params;
    const nowIso = new Date().toISOString();
    db.transaction((tx) => {
      tx.update(reglasPlazo).set({ deletedAt: nowIso, updatedAt: nowIso }).where(eq(reglasPlazo.id, id)).run();
      audit({ userId: actor.userId, entidad: 'regla_plazo', entidadId: id, accion: 'delete' }, tx);
    });
    return ok({ ok: true });
  });
}
