import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * An empty state (§1.6): a strong title, one sentence and an optional action,
 * inside a group, where the list would be.
 */
export function Empty({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1 rounded-2xl border bg-cell px-6 py-10 text-center',
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="mb-2 size-6 text-text-faint" />}
      <p className="text-headline text-text">{title}</p>
      {description && <p className="max-w-sm text-subhead text-text-dim">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
