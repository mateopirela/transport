import type * as React from 'react';

import { cn } from '@/lib/utils';

/** A block that pulses where content is coming (§1.5): give it the content's size. */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-surface-high', className)}
      {...props}
    />
  );
}

/** Rows of a group while it loads: a title line and a shorter line under it. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-separator rounded-2xl border bg-cell" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-2 px-4 py-3.5">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}
