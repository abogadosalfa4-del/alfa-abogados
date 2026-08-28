import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/shell/page-skeleton';

const Buscador = dynamic(
  () => import('@/components/causas/buscador').then((m) => ({ default: m.Buscador })),
  { loading: () => <PageSkeleton titulo="Causas" /> },
);

export const metadata = { title: 'Causas' };

export default async function CausasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <Buscador qInicial={q ?? ''} />;
}
