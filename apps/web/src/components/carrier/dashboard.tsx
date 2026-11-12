import type * as React from 'react';

import { cn } from '@/lib/utils';

/*
 * The pieces of the carrier's dashboards (docs/plan-fulmis.md §1.5, V4): a
 * section with a short label for a heading and a hairline under it. The list
 * "Requiere tu atención" is the kit's (components/ui/attention-list.tsx).
 */

/**
 * A block of a dashboard: its heading as a `label`, a count next to it, an
 * optional link on the right ("Ver todos") and a line that explains it.
 */
export function DashboardSection({
  id,
  title,
  count,
  action,
  description,
  className,
  children,
}: {
  id?: string;
  title: string;
  count?: number;
  action?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn('space-y-3', id && 'scroll-mt-24', className)}>
      <div className="flex items-end justify-between gap-4 border-b pb-2">
        <h2 className="flex items-baseline gap-2 text-label text-text-dim">
          {title}
          {count !== undefined && <span className="text-meta text-text">{count}</span>}
        </h2>
        {action}
      </div>
      {description && <p className="text-subhead text-text-dim">{description}</p>}
      {children}
    </section>
  );
}

/** The quiet link on the right of a section's heading. */
export const sectionLink = 'text-footnote font-semibold text-text hover:underline';
