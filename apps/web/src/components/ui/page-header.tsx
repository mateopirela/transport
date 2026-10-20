import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The top of a page (§1.6): the title (`largeTitle`, `title1` on a phone), a
 * pill next to the line under it, and the page's primary action on the right.
 */
export function PageHeader({
  title,
  description,
  status,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A `Pill` with the state of what the page shows. */
  status?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-8 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-title1 text-text sm:text-large-title">{title}</h1>
        {(description ?? status) && (
          <div className="flex flex-wrap items-center gap-2">
            {status}
            {description && <p className="text-callout text-text-dim">{description}</p>}
          </div>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
