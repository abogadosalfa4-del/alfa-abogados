import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/http';
import {
  obtenerDocumentoDTO,
  obtenerDocumento,
  puedeEditarDocumento,
} from '@/lib/documentos';
import { EditorClient } from '@/components/editor/editor-client';
import { IA_DISPONIBLE } from '@/lib/ai/gemini';
import type { Role } from '@/lib/db/schema';

export const metadata = { title: 'Documento' };

export default async function DocumentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const { id } = await params;

  const dto = obtenerDocumentoDTO(id);
  const doc = obtenerDocumento(id);
  if (!dto || !doc) notFound();

  const role = ((session.user as { role?: Role }).role ?? 'asistente') as Role;
  const actor = { userId: session.user.id, role };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <EditorClient
        documento={dto}
        usuario={{ id: session.user.id, nombre: session.user.name, role }}
        puedeEditar={puedeEditarDocumento(doc, actor)}
        iaDisponible={IA_DISPONIBLE}
      />
    </div>
  );
}
