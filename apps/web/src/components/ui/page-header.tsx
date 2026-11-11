import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The top of a page (§1.5): the title, a short line of context under it (with
 * a pill for the state of what the page shows) and, on the right, the place
 * of the page's primary action. A hairline closes it.
 *
 * `action` holds the one filled primary of the screen (§0.4) and, before it,
 * any secondary button; `eyebrow` is a short label over the title (a folio,
 * the section a detail belongs to).
 */
export function PageHeader({
  title,
  description,
  status,
  action,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A `Pill` with the state of what the page shows. */
  status?: React.ReactNode;
  action?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b pb-6',
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        {eyebrow && <p className="text-label text-text-dim">{eyebrow}</p>}
        <h1 className="text-title1 text-text lg:text-large-title">{title}</h1>
        {(description ?? status) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {status}
            {description && <p className="text-subhead text-text-dim">{description}</p>}
          </div>
        )}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
