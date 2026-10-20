import type * as React from 'react';

import { cn } from '@/lib/utils';

import { tagVariants, type PillTone } from './variants';

/** A small tag (radius 6) next to a name: a role, "Vence pronto". */
export function Tag({
  tone,
  className,
  ...props
}: React.ComponentProps<'span'> & { tone?: PillTone }) {
  return <span className={cn(tagVariants({ tone }), className)} {...props} />;
}
