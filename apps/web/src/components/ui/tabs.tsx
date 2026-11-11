'use client';

import { Tabs as TabsPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/*
 * Tabs inside a page on Radix: words on a hairline, the chosen one underlined
 * in the ink and heavier (§1.3: weight, not colour). For views that live in
 * the URL, `Segmented` with links.
 */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex max-w-full gap-6 overflow-x-auto border-b', className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px inline-flex h-10 shrink-0 cursor-pointer items-center border-b-2 border-transparent text-subhead whitespace-nowrap text-text-dim transition-colors duration-200 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text data-[state=active]:border-text data-[state=active]:font-semibold data-[state=active]:text-text',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        'mt-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text',
        className,
      )}
      {...props}
    />
  );
}
