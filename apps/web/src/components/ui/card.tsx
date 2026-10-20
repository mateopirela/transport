import type * as React from 'react';

import { cn } from '@/lib/utils';

/*
 * The card of the screens before the redesign, now on the system's look (a
 * group: white, radius 16, a hairline, no shadow). U7 and U8 move the screens
 * to `Group`/`Cell`; U9 deletes it.
 */

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-5 rounded-2xl border bg-cell py-5 text-text', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 px-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <h2 className={cn('text-title3', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-subhead text-text-dim', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-5', className)} {...props} />;
}
