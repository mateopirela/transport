import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A detail (§1.5): the content and, from 1024 px, a rail on the right that
 * stays in view while the content scrolls. The rail holds what decides the
 * page (its state, the amount, the actions), so on a phone it goes first,
 * over the content.
 */
export function DetailLayout({
  rail,
  className,
  children,
}: {
  /** A `DetailRail`. */
  rail: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start', className)}>
      <aside className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1">{rail}</aside>
      <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-1">{children}</div>
    </div>
  );
}

/** The rail of a detail: a cell with a hairline, its sections parted by hairlines. */
export function DetailRail({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('divide-y divide-separator border bg-cell', className)} {...props} />;
}

/**
 * A section of the rail: a `label` and what goes under it (a pill, a `Money`
 * in `numeral`, the buttons, each the whole width).
 */
export function RailSection({
  label,
  className,
  children,
}: {
  label?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-3 p-5', className)}>
      {label && <p className="text-label text-text-dim">{label}</p>}
      {children}
    </div>
  );
}

/** The buttons of the rail, one under another: the primary first. */
export function RailActions({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2 [&>*]:w-full', className)} {...props} />;
}
