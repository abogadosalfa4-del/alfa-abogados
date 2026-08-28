import { z } from 'zod';
import { errores, handleErrors, ok, parseBody, requireRole } from '@/lib/http';
import { graphConfigurado } from '@/lib/outlook/graph';
import { esClientIdValido, guardarGraphApp, graphClientId, graphTenantId } from '@/lib/outlook/env-graph';

export function GET() {
  return handleErrors(async () => {
    await requireRole('admin');
    return ok({
      clientId: graphClientId() ?? '',
      tenantId: graphTenantId(),
      configurado: graphConfigurado(),
    });
  });
}

const schema = z.object({
  clientId: z.string().trim().min(1),
  tenantId: z.string().trim().min(1).default('common'),
});

/** Guarda el Id. de la app de Entra en `.env` (solo admin). */
export function POST(req: Request) {
  return handleErrors(async () => {
    await requireRole('admin');
    const { clientId, tenantId } = await parseBody(req, schema);
    if (!esClientIdValido(clientId)) {
      throw errores.validacion('El Id. de aplicación no es un UUID válido.');
    }
    try {
      guardarGraphApp(clientId, tenantId);
    } catch (err) {
      throw errores.validacion(err instanceof Error ? err.message : 'No se pudo guardar.');
    }
    return ok({ configurado: graphConfigurado() });
  });
}
