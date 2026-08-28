'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PanelCorreos } from '@/components/correos/panel-correos';
import { useSesion } from '@/components/shell/providers';

export function CorreosConRol() {
  const { role } = useSesion();
  const router = useRouter();

  useEffect(() => {
    if (role === 'asistente') router.replace('/calendario');
  }, [role, router]);

  if (role === 'asistente') return null;
  return (
    <div className="h-full min-h-0">
      <PanelCorreos puedeConfigurar={role === 'admin'} />
    </div>
  );
}
