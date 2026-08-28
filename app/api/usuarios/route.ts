import { asc, eq } from 'drizzle-orm';
import { handleErrors, ok, requireSession } from '@/lib/http';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';

/** Usuarios activos, para selects de asignación (PLAN §7.1). */
export function GET() {
  return handleErrors(async () => {
    await requireSession();
    const usuarios = db
      .select({ id: user.id, name: user.name, role: user.role })
      .from(user)
      .where(eq(user.activo, true))
      .orderBy(asc(user.name))
      .all();
    return ok({ usuarios });
  });
}
