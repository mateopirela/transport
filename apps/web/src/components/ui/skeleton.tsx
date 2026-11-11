import { uiCopy } from '@transport/shared';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/*
 * Skeletons (§1.5) for the `loading.tsx` of each segment: blocks that pulse
 * where the content is coming, in the shape of the piece they stand for.
 */

/**
 * A block that pulses where content is coming: give it the content's size.
 * It takes the hairline colour, which shows on the page and on a cell in both themes.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-sm bg-separator', className)}
      {...props}
    />
  );
}

/** Rows of a group while it loads: a title line and a shorter line under it. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-separator border bg-cell" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-2 px-4 py-3">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}

/** A table while it loads: the line of headings and rows of 44 px. */
export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-separator border bg-cell" aria-hidden>
      <div className="flex h-10 items-center gap-6 px-4">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex h-table-row items-center gap-6 px-4">
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className={cn('h-3.5 flex-1', i === 0 && 'flex-2')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The row of indicators of a dashboard while it loads. */
export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-hidden
      className={cn(
        'grid gap-px border bg-separator sm:grid-cols-2',
        count >= 4 ? 'lg:grid-cols-4' : count === 3 && 'lg:grid-cols-3',
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-4 bg-cell p-5">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

/** The header of a page while it loads: the title, its line and the primary. */
function SkeletonHeader() {
  return (
    <div aria-hidden className="mb-8 flex items-end justify-between gap-6 border-b pb-6">
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="hidden h-control w-36 rounded-lg sm:block" />
    </div>
  );
}

/**
 * A whole page while it loads, for a `loading.tsx`: the header and, under it,
 * the shape of the page: a `list` (a table), a `dashboard` (indicators and a
 * table) or a `detail` (the content and its rail). A screen reader hears
 * "Cargando…" once.
 */
export function SkeletonPage({ shape = 'list' }: { shape?: 'list' | 'dashboard' | 'detail' }) {
  return (
    <div role="status">
      <span className="sr-only">{uiCopy.loading}</span>
      <SkeletonHeader />
      {shape === 'dashboard' && (
        <div className="space-y-8">
          <SkeletonKpis />
          <SkeletonTable rows={4} />
        </div>
      )}
      {shape === 'list' && <SkeletonTable />}
      {shape === 'detail' && (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="space-y-8">
            <SkeletonRows rows={4} />
            <SkeletonRows rows={3} />
          </div>
          <div aria-hidden className="space-y-4 border bg-cell p-5">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-control w-full rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
