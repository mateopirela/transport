import { ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import { groupRow } from './variants';

/**
 * A row of a `Group` (§1.3): 44 px or more, an optional icon, the title and
 * up to two lines under it, a value or a pill on the right, and a chevron
 * when it opens something (`href`). `children` go under the text, the whole
 * width (a form, a list of documents).
 */
export function Cell({
  title,
  subtitle,
  value,
  icon: Icon,
  trailing,
  href,
  className,
  children,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  icon?: LucideIcon;
  /** A pill, a count, a small button after the text. */
  trailing?: React.ReactNode;
  href?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      {Icon && <Icon aria-hidden className="size-4.5 shrink-0 text-text-dim" />}
      <span className="min-w-0 flex-1">
        {title && <span className="block text-subhead font-medium text-text">{title}</span>}
        {subtitle && (
          <span className="mt-0.5 line-clamp-2 block text-footnote text-text-dim">{subtitle}</span>
        )}
      </span>
      {value !== undefined && (
        <span className="shrink-0 text-subhead text-text-dim tabular-nums">{value}</span>
      )}
      {trailing}
      {href && <ChevronRight aria-hidden className="size-4 shrink-0 text-text-dim" />}
    </>
  );
  const row = 'flex min-h-table-row items-center gap-3 px-4 py-2.5';
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          groupRow,
          row,
          // The page colour, not the raised surface: a row may hold accent text (§1.1).
          'transition-colors duration-150 hover:bg-bg focus-visible:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text',
          className,
        )}
      >
        {body}
      </Link>
    );
  }
  return (
    <div className={cn(groupRow, children ? 'px-4 py-2.5' : row, className)}>
      {children ? (
        <>
          {(title ?? subtitle ?? value ?? trailing ?? Icon) && (
            <div className="flex min-h-7 items-center gap-3">{body}</div>
          )}
          {children}
        </>
      ) : (
        body
      )}
    </div>
  );
}

/** A label and its value on one line, inside a group (a detail's facts). */
export function ValueRow({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        groupRow,
        'flex min-h-table-row flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-4 py-2.5',
        className,
      )}
    >
      <span className="text-footnote text-text-dim">{label}</span>
      <span className="text-subhead font-medium text-text tabular-nums">{children}</span>
    </div>
  );
}
