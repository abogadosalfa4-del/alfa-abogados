'use client';

import { Calendario } from '@/components/calendario/calendario';
import { esEditor, useSesion } from '@/components/shell/providers';

export function CalendarioConRol() {
  const { role } = useSesion();
  return <Calendario puedeEditar={esEditor(role)} />;
}
