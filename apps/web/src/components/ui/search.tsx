import { Search as SearchIcon } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import { fieldControl } from './variants';

/**
 * A search field: an `Input` with the magnifier inside. It needs an accessible
 * name (`aria-label` or a `Label`). `className` goes on the wrapper.
 */
export function Search({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <span className={cn('relative block', className)}>
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-dim"
      />
      <input type="search" className={cn(fieldControl, 'h-control pl-9')} {...props} />
    </span>
  );
}
