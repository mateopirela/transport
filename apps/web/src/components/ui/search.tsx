import { Search as SearchIcon } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import { fieldControl } from './variants';

/**
 * A search field: a pill with the magnifier inside. It needs an accessible
 * name (`aria-label` or a `Label`). `className` goes on the wrapper.
 */
export function Search({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <span className={cn('relative block', className)}>
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-faint"
      />
      <input type="search" className={cn(fieldControl, 'h-11 rounded-full pl-10')} {...props} />
    </span>
  );
}
