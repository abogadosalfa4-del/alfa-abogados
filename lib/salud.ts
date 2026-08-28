import { count, eq } from 'drizzle-orm';
import { env } from '@/lib/env';
import { db } from '@/lib/db';
import { graphTokens, ragChunks, user } from '@/lib/db/schema';
import { estadoOutbite } from '@/lib/outlook/outbite';
import { graphConfigurado } from '@/lib/outlook/graph';
import { IA_DISPONIBLE } from '@/lib/ai/gemini';

export type ItemSalud = {
  id: string;
  titulo: string;
  ok: boolean;
  detalle: string;
  href?: string;
};

export function snapshotSalud(): { items: ItemSalud[] } {
  const casillero = estadoOutbite().configurado;
  const graphApp = graphConfigurado();
  const graphVinculado = Boolean(db.select({ userId: graphTokens.userId }).from(graphTokens).get());
  const nCodigos =
    db
      .select({ n: count() })
      .from(ragChunks)
      .where(eq(ragChunks.fuenteTipo, 'codigo'))
      .get()?.n ?? 0;
  const nUsuarios = db.select({ n: count() }).from(user).get()?.n ?? 0;

  const items: ItemSalud[] = [
    {
      id: 'casillero',
      titulo: 'Casillero outbite.app',
      ok: casillero,
      detalle: casillero
        ? 'Worker configurado; las notificaciones entran solas.'
        : 'Falta URL y secreto del Worker en Correos.',
      href: '/correos',
    },
    {
      id: 'ia',
      titulo: 'Asistente IA',
      ok: IA_DISPONIBLE,
      detalle: IA_DISPONIBLE
        ? 'Gemini 3.5 Flash-Lite listo.'
        : 'Falta GEMINI_API_KEY en .env (Google AI Studio).',
      href: '/asistente',
    },
    {
      id: 'codigos',
      titulo: 'Códigos legales (RAG)',
      ok: nCodigos > 0,
      detalle:
        nCodigos > 0
          ? `${nCodigos} fragmentos indexados.`
          : 'Subí COGEP, Civil, COIP… en Administración → Códigos.',
      href: '/admin/codigos',
    },
    {
      id: 'graph',
      titulo: 'Outlook / Hotmail (Graph)',
      ok: graphApp && graphVinculado,
      detalle: !graphApp
        ? 'Opcional. Hotmail personal no registra app Entra; el casillero usa outbite.app.'
        : graphVinculado
          ? 'Buzón vinculado.'
          : 'App Entra lista; falta vincular el buzón en Correos.',
      href: '/correos',
    },
    {
      id: 'equipo',
      titulo: 'Usuarios del despacho',
      ok: nUsuarios > 1,
      detalle:
        nUsuarios > 1
          ? `${nUsuarios} cuentas.`
          : 'Solo está el admin. Creá al resto del equipo.',
      href: '/admin/usuarios',
    },
    {
      id: 'lan',
      titulo: 'Acceso en la red (LAN)',
      ok: !/localhost|127\.0\.0\.1/i.test(env.BETTER_AUTH_URL),
      detalle: /localhost|127\.0\.0\.1/i.test(env.BETTER_AUTH_URL)
        ? `BETTER_AUTH_URL es ${env.BETTER_AUTH_URL}. En el PC servidor usá http://IP:3000.`
        : env.BETTER_AUTH_URL,
    },
  ];

  return { items };
}
