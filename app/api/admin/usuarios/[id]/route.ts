import { z } from 'zod';
import { handleErrors, ok, parseBody, requireRole } from '@/lib/http';
import { ROLES } from '@/lib/db/schema';
import { cambiarPassword, setActivo, setRole } from '@/lib/auth-admin';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.union([
  z.object({ role: z.enum(ROLES) }),
  z.object({ activo: z.boolean() }),
  z.object({ password: z.string().min(8).max(200) }),
]);

export function PATCH(req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireRole('admin');
    const { id } = await ctx.params;
    const body = await parseBody(req, schema);
    if ('role' in body) setRole(id, body.role, actor.userId);
    else if ('activo' in body) setActivo(id, body.activo, actor.userId);
    else await cambiarPassword(id, body.password);
    return ok({ ok: true });
  });
}
