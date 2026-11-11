import type * as React from 'react';

import { cn } from '@/lib/utils';

import { tableCellClass } from './variants';

/** A column: its heading, or the heading with how it lines up. */
export type TableHeader =
  | string
  | {
      label: string;
      /** A column of figures lines up to the right, like its cells. */
      align?: 'left' | 'right';
      /** A heading only a screen reader needs (the column of row actions). */
      srOnly?: boolean;
    };

const BODY =
  'divide-y divide-separator [&_td]:h-table-row [&_td]:px-4 [&_td]:py-2 [&_td]:align-middle [&_tr]:transition-colors [&_tr:hover]:bg-bg';

/*
 * Under 640 px each row is a card (§1.5): the row a bordered cell, each `td` a
 * line with its heading on the left (the `label` of `TableCell`) and its value
 * on the right. CSS only: the same markup serves both shapes.
 */
const BODY_CARDS =
  'max-sm:block max-sm:space-y-3 max-sm:[&_tr]:block max-sm:[&_tr]:border max-sm:[&_tr]:bg-cell max-sm:[&_tr]:px-4 max-sm:[&_tr]:py-3 max-sm:[&_tr:hover]:bg-cell max-sm:[&_td]:flex max-sm:[&_td]:h-auto max-sm:[&_td]:items-baseline max-sm:[&_td]:justify-between max-sm:[&_td]:gap-4 max-sm:[&_td]:px-0 max-sm:[&_td]:py-1 max-sm:[&_td:empty]:hidden';

/**
 * A real table (§1.5) on a cell with a hairline and no radius: headings in
 * `label`, rows of 44 px, text at 14 px, no stripes. It scrolls sideways when
 * it does not fit; with `cards`, under 640 px each row becomes a card instead
 * (build its rows with `TableRow` and `TableCell`, which carry the headings).
 *
 * The roles are written out because a table drawn as blocks loses them in
 * some browsers.
 */
export function Table({
  headers,
  cards = false,
  className,
  children,
}: {
  headers: readonly TableHeader[];
  /** Rows become cards on a phone instead of scrolling sideways. */
  cards?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-cards={cards ? '' : undefined}
      className={cn(
        // `relative` keeps visually hidden content inside the scroll box, so it cannot widen the page.
        'group/table relative overflow-x-auto border bg-cell',
        cards && 'max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent',
        className,
      )}
    >
      <table role="table" className={cn('w-full text-left text-table', cards && 'max-sm:block')}>
        <thead
          role="rowgroup"
          className={cn('border-b text-label text-text-dim', cards && 'max-sm:sr-only')}
        >
          <tr role="row">
            {headers.map((header) => {
              const column = typeof header === 'string' ? { label: header } : header;
              return (
                <th
                  key={column.label}
                  role="columnheader"
                  scope="col"
                  className={cn(
                    'h-10 px-4 whitespace-nowrap',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  {column.srOnly ? <span className="sr-only">{column.label}</span> : column.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody role="rowgroup" className={cn(BODY, cards && BODY_CARDS)}>
          {children}
        </tbody>
      </table>
    </div>
  );
}

/** A row of a `Table`. */
export function TableRow(props: React.ComponentProps<'tr'>) {
  return <tr role="row" {...props} />;
}

/**
 * A cell of a `Table`. `label` is the heading of its column, shown next to the
 * value when the row is a card; `numeric` lines a figure up to the right in
 * tabular digits (§1.2); `primary` is what names the row (the title of its
 * card) and `action` the cell of its button or link (the foot of its card).
 */
export function TableCell({
  label,
  numeric = false,
  align,
  primary = false,
  action = false,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<'td'>, 'align'> & {
  label?: string;
  numeric?: boolean;
  align?: 'left' | 'right';
  primary?: boolean;
  action?: boolean;
}) {
  return (
    <td
      role="cell"
      className={cn(
        tableCellClass({ align, numeric }),
        primary &&
          'font-medium text-text max-sm:group-data-cards/table:pb-2 max-sm:group-data-cards/table:text-subhead max-sm:group-data-cards/table:font-semibold',
        action &&
          'text-right whitespace-nowrap max-sm:group-data-cards/table:justify-end max-sm:group-data-cards/table:pt-3',
        className,
      )}
      {...props}
    >
      {label ? (
        <>
          {/* The column heading keeps naming the cell for a screen reader. */}
          <span
            aria-hidden
            className="hidden shrink-0 text-label font-bold text-text-dim max-sm:group-data-cards/table:block"
          >
            {label}
          </span>
          <div className="min-w-0 max-sm:group-data-cards/table:text-right">{children}</div>
        </>
      ) : (
        children
      )}
    </td>
  );
}
