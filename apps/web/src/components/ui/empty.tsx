import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * An empty state (§1.5): what is missing, the next step in one sentence and
 * the button that takes it, where the list would be. `plain` drops the cell
 * and its hairline, for an empty inside something that already has them (a
 * group, the rail of a detail).
 */
export function Empty({
  title,
  description,
  icon: Icon,
  action,
  variant = 'card',
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** The button or link of the next step. */
  action?: React.ReactNode;
  variant?: 'card' | 'plain';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1.5 px-6 py-12 text-center',
        variant === 'card' && 'border bg-cell',
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="mb-2 size-6 text-text-dim" />}
      <p className="text-headline text-text">{title}</p>
      {description && <p className="max-w-sm text-subhead text-text-dim">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
