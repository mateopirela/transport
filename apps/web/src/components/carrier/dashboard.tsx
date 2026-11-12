import Link from 'next/link';
import type * as React from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import type { PillTone } from '@/components/ui/variants';
import { cn } from '@/lib/utils';

/*
 * The pieces of the carrier's dashboards (docs/plan-fulmis.md §1.5, V4): a
 * section with a short label for a heading and a hairline under it, and the
 * list "Requiere tu atención", one action per row.
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

export interface AttentionItem {
  key: string;
  /** What kind of thing it is, as a tag in the tone of its state. */
  tag: { label: string; tone: PillTone };
  title: string;
  detail?: string;
  action: { href: string; label: string };
}

/**
 * "Requiere tu atención": one row per thing to do, the tag of its kind on the
 * left, what it is and why in the middle, and its one action on the right.
 * Rows split by hairlines inside one cell.
 */
export function AttentionList({
  items,
  footer,
}: {
  items: readonly AttentionItem[];
  /** Links to the lists with the rows left out. */
  footer?: React.ReactNode;
}) {
  return (
    <div className="border bg-cell">
      <ul className="divide-y divide-separator">
        {items.map((item) => (
          <li
            key={item.key}
            className="grid gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center"
          >
            <span>
              <Tag tone={item.tag.tone}>{item.tag.label}</Tag>
            </span>
            <span className="min-w-0 space-y-0.5">
              <span className="block text-subhead font-semibold text-text">{item.title}</span>
              {item.detail && (
                <span className="block text-footnote text-text-dim">{item.detail}</span>
              )}
            </span>
            <Link
              href={item.action.href}
              className={cn(
                buttonVariants({ variant: 'secondary', size: 'sm' }),
                'justify-self-start',
              )}
            >
              {item.action.label}
            </Link>
          </li>
        ))}
      </ul>
      {footer && <div className="flex flex-wrap gap-x-6 gap-y-2 border-t px-5 py-3">{footer}</div>}
    </div>
  );
}
