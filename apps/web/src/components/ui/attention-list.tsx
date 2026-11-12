import Link from 'next/link';
import type * as React from 'react';

import { buttonVariants } from './button';
import { Pill } from './pill';
import type { PillTone } from './variants';

export interface AttentionRow {
  key: string;
  /** The kind, in a few words ("Oferta", "Pago rápido"), as a pill in the tone of its state. */
  tag: string;
  tone: PillTone;
  /** What it is: a route, a company, a document. */
  title: React.ReactNode;
  /** Why it waits, in one line. */
  detail?: React.ReactNode;
  href: string;
  /** The one action of the row, a verb: "Revisar oferta". */
  action: string;
}

/**
 * "Requiere tu atención" (docs/plan-fulmis.md §1.5): one row per thing that
 * waits for whoever looks, parted by hairlines, with its kind as a pill on
 * the left (words, never the colour alone), what it is and why in the
 * middle, and its one action on the right. The actions are outlined: the
 * filled primary of the page stays in its header. It draws no box of its
 * own, so it sits in a `Panel` or a bordered cell; with no rows it shows
 * `empty`, and `footer` goes under the rows (what was left out).
 */
export function AttentionList({
  rows,
  empty,
  footer,
}: {
  rows: readonly AttentionRow[];
  empty?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <>
      <ul className="divide-y divide-separator">
        {rows.map((row) => (
          <li
            key={row.key}
            className="grid gap-x-5 gap-y-2 px-5 py-3.5 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center"
          >
            <span>
              <Pill tone={row.tone} className="max-w-full justify-center sm:w-full">
                <span className="truncate">{row.tag}</span>
              </Pill>
            </span>
            <span className="min-w-0 space-y-0.5">
              <span className="block truncate text-subhead font-semibold text-text">
                {row.title}
              </span>
              {row.detail && (
                <span className="block text-footnote text-text-dim">{row.detail}</span>
              )}
            </span>
            <Link
              href={row.href}
              className={buttonVariants({
                variant: 'secondary',
                size: 'sm',
                className: 'justify-self-start',
              })}
            >
              {row.action}
            </Link>
          </li>
        ))}
      </ul>
      {footer && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t px-5 py-3 text-footnote text-text-dim">
          {footer}
        </div>
      )}
    </>
  );
}
