import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/shell/page-skeleton';

const CalendarioConRol = dynamic(
  () =>
    import('@/components/calendario/calendario-rol').then((m) => ({
      default: m.CalendarioConRol,
    })),
  { loading: () => <PageSkeleton titulo="Calendario" /> },
);

export const metadata = { title: 'Calendario' };

export default function CalendarioPage() {
  return <CalendarioConRol />;
}
