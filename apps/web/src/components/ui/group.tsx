import type * as React from 'react';

import { cn } from '@/lib/utils';

/** The small label over a group (§1.2 `label`). */
export function GroupLabel({ className, ...props }: React.ComponentProps<'h2'>) {
  return <h2 className={cn('mb-1.5 px-4 text-label text-text-dim', className)} {...props} />;
}

/** The line under a group: a footnote that explains it. */
export function GroupFooter({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('mt-1.5 px-4 text-footnote text-text-dim', className)} {...props} />;
}

/**
 * A group of cells (§1.6): white on the warm page, radius 16, a hairline,
 * and the separators of its `Cell`s inset 16. `label` and `footer` sit
 * outside it, above and below.
 */
export function Group({
  label,
  footer,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<'section'>, 'title'> & {
  label?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className={className} {...props}>
      {label && <GroupLabel>{label}</GroupLabel>}
      <div className="overflow-hidden rounded-2xl border bg-cell">{children}</div>
      {footer && <GroupFooter>{footer}</GroupFooter>}
    </section>
  );
}
