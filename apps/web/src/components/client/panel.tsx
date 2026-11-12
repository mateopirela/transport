import { useId } from 'react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A block of the client's dashboard or detail (docs/plan-fulmis.md §1.5): a
 * cell with a hairline and no radius, its heading on the first line (with a
 * count or a link on the right) and its content under a hairline. What goes
 * inside is drawn without its own box: rows, a table, steps.
 */
export function Panel({
  title,
  count,
  action,
  className,
  children,
}: {
  title: React.ReactNode;
  /** A small count next to the heading (a `Pill`). */
  count?: React.ReactNode;
  /** A link on the right of the heading ("Ver todas"). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn('border bg-cell', className)}>
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 id={id} className="text-headline font-extrabold text-text">
            {title}
          </h2>
          {count}
        </div>
        {action}
      </div>
      <div className="border-t">{children}</div>
    </section>
  );
}

/** The link that names a row of a table (a route): the ink, underlined on hover. */
export const rowLink =
  'rounded-sm font-semibold text-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text';

/** A text link on the right of a panel's heading. */
export const panelLink =
  'rounded-sm text-subhead font-semibold text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text';
