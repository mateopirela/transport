import type * as React from 'react';

import { cn } from '@/lib/utils';

import { fieldControl } from './variants';

/** A text field (§1.6): 44 px, radius 12. */
export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(fieldControl, 'h-11', className)} {...props} />;
}
