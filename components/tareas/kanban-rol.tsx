'use client';

import { Kanban } from '@/components/tareas/kanban';
import { esEditor, useSesion } from '@/components/shell/providers';

export function KanbanConRol() {
  const { id, role } = useSesion();
  return <Kanban puedeCrear={esEditor(role)} userId={id} />;
}
