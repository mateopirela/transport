import type { StateTone } from '@transport/shared';
import Link from 'next/link';
import type * as React from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { cn } from '@/lib/utils';

export interface AttentionRow {
  key: string;
  tone: StateTone;
  /** The kind, in a few words: "Pago rápido", "Documento". */
  tag: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  href: string;
  /** The one action of the row, a verb: "Revisar empresa". */
  action: string;
}

/**
 * "Requiere tu atención" (docs/plan-fulmis.md §1.5): one cell, its heading
 * with the count, and a row per thing that waits for the admin, each with
 * its kind as a pill (words, never the colour alone), what it is, and one
 * outlined action. The filled primary of the page stays in its header.
 */
export function AttentionList({
  title,
  count,
  rows,
  more,
  empty,
}: {
  title: string;
  /** The count next to the heading, in words ("3 pendientes"). */
  count: string;
  rows: readonly AttentionRow[];
  /** A line under the rows when some were left out. */
  more?: React.ReactNode;
  /** What shows when nothing waits. */
  empty: React.ReactNode;
}) {
  return (
    <section aria-labelledby="attention-title" className="border bg-cell">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <h2 id="attention-title" className="text-headline text-text">
          {title}
        </h2>
        {rows.length > 0 && <Pill tone="attention">{count}</Pill>}
      </div>
      {rows.length === 0 ? (
        <div className="border-t px-5 py-6">{empty}</div>
      ) : (
        <ul>
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t px-5 py-3.5"
            >
              <Pill tone={row.tone} className="w-32 justify-center text-label">
                {row.tag}
              </Pill>
              <div className="min-w-0 flex-1 basis-64">
                <p className="truncate text-subhead font-semibold text-text">{row.title}</p>
                {row.detail && <p className="truncate text-footnote text-text-dim">{row.detail}</p>}
              </div>
              <Link
                href={row.href}
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
              >
                {row.action}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {more && <div className="border-t px-5 py-3 text-footnote text-text-dim">{more}</div>}
    </section>
  );
}
