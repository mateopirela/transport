import type * as React from 'react';

import { cn } from '@/lib/utils';

import { pillVariants, type PillTone } from './variants';

export { pillVariants, type PillTone };

/** A status pill (§1.6): footnote semibold in its tone over the tone at 14 %. */
export function Pill({
  tone,
  className,
  ...props
}: React.ComponentProps<'span'> & { tone?: PillTone }) {
  return <span className={cn(pillVariants({ tone }), className)} {...props} />;
}
