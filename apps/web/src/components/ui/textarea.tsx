import type * as React from 'react';

import { cn } from '@/lib/utils';

import { fieldControl } from './variants';

/** A multi-line field, with the look of `Input`. */
export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldControl, 'min-h-24 py-2.5', className)} {...props} />;
}
