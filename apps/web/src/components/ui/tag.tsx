import { Check } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import { tagVariants, type PillTone } from './variants';

/** A small tag (radius 3) next to a name: a role, "Vence pronto". Same tones as `Pill`. */
export function Tag({
  tone,
  className,
  children,
  ...props
}: React.ComponentProps<'span'> & { tone?: PillTone }) {
  return (
    <span className={cn(tagVariants({ tone }), className)} {...props}>
      {tone === 'done' && <Check aria-hidden />}
      {children}
    </span>
  );
}
