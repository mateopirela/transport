import { ChevronDown } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import { fieldControl } from './variants';

/**
 * A select with the look of `Input`. It stays a native `<select>`: forms post
 * it to server actions as it is, phones open their own picker, and the E2E
 * tests choose options with `selectOption`. `className` goes on the wrapper
 * (its width and place in a grid).
 */
export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <span className={cn('relative block', className)}>
      <select
        className={cn(fieldControl, 'h-11 cursor-pointer appearance-none pr-10')}
        {...props}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-text-dim"
      />
    </span>
  );
}
