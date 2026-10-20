'use client';

import { Label as LabelPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/** The label over a field (§1.2 `label`: 13, semibold, secondary). */
export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-label text-text-dim select-none', className)}
      {...props}
    />
  );
}
