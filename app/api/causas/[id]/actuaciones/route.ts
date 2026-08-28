import { z } from 'zod';
import { handleErrors, ok, parseBody, requireRole } from '@/lib/http';
import { agregarActuacionManual } from '@/lib/causas';

const schema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.string().trim().min(1).max(200),
  detalle: z.string().trim().min(1).max(20_000),
});

type Ctx = { params: Promise<{ id: string }> };

export function POST(req: Request, ctx: Ctx) {
  return handleErrors(async () => {
    const actor = await requireRole('admin', 'abogado', 'secretario');
    const { id } = await ctx.params;
    const input = await parseBody(req, schema);
    return ok({ resultado: agregarActuacionManual(id, input, actor) }, { status: 201 });
  });
}
