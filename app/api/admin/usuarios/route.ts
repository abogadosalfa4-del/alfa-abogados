import { asc } from 'drizzle-orm';
import { z } from 'zod';
import { handleErrors, ok, parseBody, requireRole } from '@/lib/http';
import { db } from '@/lib/db';
import { user, ROLES } from '@/lib/db/schema';
import { crearUsuario } from '@/lib/auth-admin';

export function GET() {
  return handleErrors(async () => {
    await requireRole('admin');
    return ok({
      usuarios: db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          activo: user.activo,
          createdAt: user.createdAt,
        })
        .from(user)
        .orderBy(asc(user.name))
        .all(),
    });
  });
}

const crearSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  role: z.enum(ROLES),
});

export function POST(req: Request) {
  return handleErrors(async () => {
    const actor = await requireRole('admin');
    const input = await parseBody(req, crearSchema);
    const nuevo = await crearUsuario({ ...input, creadoPor: actor.userId });
    return ok({ usuario: { id: nuevo.id, email: nuevo.email } }, { status: 201 });
  });
}
