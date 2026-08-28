'use client';

import { NavLink } from '@/components/shell/nav-link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  Scale,
  MessagesSquare,
  KanbanSquare,
  FileText,
  Mail,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/db/schema';
import { APP_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { href: '/calendario', label: 'Calendario', icon: CalendarDays },
  { href: '/causas', label: 'Causas', icon: Scale },
  { href: '/asistente', label: 'Asistente IA', icon: MessagesSquare },
  { href: '/tareas', label: 'Tareas', icon: KanbanSquare },
  { href: '/documentos', label: 'Documentos', icon: FileText },
  { href: '/correos', label: 'Correos', icon: Mail },
  { href: '/admin', label: 'Administración', icon: Settings, roles: ['admin'] },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <div className="relative h-full w-14 shrink-0">
      <aside
        className={cn(
          'group/sidebar absolute inset-y-0 left-0 z-30 flex w-14 flex-col overflow-hidden',
          'border-r bg-card transition-[width,box-shadow] duration-200 ease-out',
          'hover:w-56 hover:shadow-lg',
        )}
      >
        <div
          className={cn(
            'flex h-14 shrink-0 items-center border-b',
            'justify-center px-0 group-hover/sidebar:justify-start group-hover/sidebar:gap-2 group-hover/sidebar:px-4',
          )}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Scale className="size-4" />
          </div>
          <span
            className={cn(
              'max-w-0 overflow-hidden whitespace-nowrap font-semibold tracking-tight opacity-0',
              'transition-all duration-200',
              'group-hover/sidebar:max-w-[10rem] group-hover/sidebar:opacity-100',
            )}
          >
            {APP_NAME}
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2">
          {NAV.filter((item) => !item.roles || item.roles.includes(role)).map(
            (item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={active}
                />
              );
            },
          )}
        </nav>
      </aside>
    </div>
  );
}
