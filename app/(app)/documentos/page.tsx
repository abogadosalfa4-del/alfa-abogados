import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/shell/page-skeleton';

const ListaDocumentos = dynamic(
  () =>
    import('@/components/editor/lista-documentos').then((m) => ({
      default: m.ListaDocumentos,
    })),
  { loading: () => <PageSkeleton titulo="Documentos" /> },
);

export const metadata = { title: 'Documentos' };

export default function DocumentosPage() {
  return <ListaDocumentos puedeCrear />;
}
