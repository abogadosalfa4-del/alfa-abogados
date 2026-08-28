import { ExpedienteCausa } from '@/components/causas/expediente';

export const metadata = { title: 'Expediente' };

export default async function ExpedientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExpedienteCausa id={id} />;
}
