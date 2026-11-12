import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { Money } from './money';

const COLUMNS: Record<number, string> = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

/**
 * The row of indicators of a dashboard (§1.5): up to four `KpiTile`s side by
 * side, parted by hairlines (one cell, not four boxes). On a phone they stack
 * (a figure in `numeral` does not fit in half of 390 px), two side by side
 * from `sm` and four from `lg`.
 */
export function KpiGrid({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & { children: React.ReactNode }) {
  const count = Math.min(React.Children.toArray(children).length, 4);
  return (
    <div className={cn('grid gap-px border bg-separator', COLUMNS[count], className)} {...props}>
      {children}
    </div>
  );
}

/**
 * One indicator (§1.5): its `label`, the figure in `numeral` and a line of
 * context. An amount goes in `cents` (drawn by `Money` in `numeral`, with its
 * weight); `value` takes a count, or a dash when the figure cannot be read.
 * With `href` the whole tile is a link to the list already filtered;
 * `attention` marks the one that asks the viewer to act with the accent
 * square, next to its words (never the colour alone).
 */
export function KpiTile({
  label,
  value,
  cents,
  hint,
  href,
  attention = false,
  className,
}: {
  label: string;
  /** The figure: a count, or a dash. */
  value?: React.ReactNode;
  /** The figure as an amount, from its cents; `null` shows `value` instead. */
  cents?: number | bigint | string | null;
  hint?: React.ReactNode;
  href?: string;
  attention?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-label text-text-dim">
        {attention && <span aria-hidden className="size-2 shrink-0 bg-accent" />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {href && <ArrowUpRight aria-hidden className="size-4 shrink-0" />}
      </span>
      <span className="text-numeral text-text tabular-nums">
        {cents === undefined || cents === null ? value : <Money cents={cents} size="numeral" />}
      </span>
      {hint && <span className="text-footnote text-text-dim">{hint}</span>}
    </>
  );
  const tile = 'flex min-w-0 flex-col gap-2 bg-cell p-5';
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          tile,
          'transition-colors duration-150 hover:bg-bg focus-visible:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text',
          className,
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={cn(tile, className)}>{body}</div>;
}
