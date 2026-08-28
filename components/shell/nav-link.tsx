'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useLinkStatus } from 'next/link';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

function NavLinkInner({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  const { pending } = useLinkStatus();

  return (
    <Link
      href={href}
      prefetch
      title={label}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={cn(
        'flex items-center rounded-md py-2.5 text-sm font-medium transition-colors',
        'justify-center px-0 group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        pending && !active && 'bg-accent/60 text-foreground',
      )}
    >
      {pending && !active ? (
        <Loader2 className="size-[1.125rem] shrink-0 animate-spin" aria-hidden />
      ) : (
        <Icon className="size-[1.125rem] shrink-0" aria-hidden />
      )}
      <span
        className={cn(
          'max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200',
          'group-hover/sidebar:max-w-[11rem] group-hover/sidebar:opacity-100',
        )}
      >
        {label}
      </span>
    </Link>
  );
}

export function NavLink(props: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Suspense fallback={<NavLinkFallback {...props} />}>
      <NavLinkInner {...props} />
    </Suspense>
  );
}

function NavLinkFallback({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch
      title={label}
      aria-label={label}
      className={cn(
        'flex items-center rounded-md py-2.5 text-sm font-medium transition-colors',
        'justify-center px-0 group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icon className="size-[1.125rem] shrink-0" aria-hidden />
      <span
        className={cn(
          'max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200',
          'group-hover/sidebar:max-w-[11rem] group-hover/sidebar:opacity-100',
        )}
      >
        {label}
      </span>
    </Link>
  );
}
