import { ExpedienteCliente } from '@/components/causas/expediente-cliente';

export const metadata = { title: 'Cliente' };

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ causa?: string }>;
}) {
  const { id } = await params;
  const { causa } = await searchParams;
  return <ExpedienteCliente id={id} causaId={causa ?? null} />;
}
