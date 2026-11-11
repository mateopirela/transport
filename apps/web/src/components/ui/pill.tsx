import { Check } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import { pillVariants, type PillTone } from './variants';

export { pillVariants, type PillTone };

/**
 * A status pill (§1.1): filled with its tone, radius 999. The state is never
 * the colour alone: a pill carries its words, and `done` a check before them.
 */
export function Pill({
  tone,
  className,
  children,
  ...props
}: React.ComponentProps<'span'> & { tone?: PillTone }) {
  return (
    <span className={cn(pillVariants({ tone }), className)} {...props}>
      {tone === 'done' && <Check aria-hidden />}
      {children}
    </span>
  );
}
