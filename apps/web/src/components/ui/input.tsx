import type * as React from 'react';

import { cn } from '@/lib/utils';

import { fieldControl } from './variants';

/** A text field (§1.3): 40 px, radius 3, a 1 px border. */
export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(fieldControl, 'h-control', className)} {...props} />;
}
