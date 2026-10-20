'use client';

import { Tabs as TabsPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/*
 * Tabs inside a page (§1.6) on Radix: chips in a row, the chosen one in the
 * accent's soft tone. For views that live in the URL, `Segmented` with links.
 */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex max-w-full gap-1.5 overflow-x-auto pb-1', className)}
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
        'inline-flex h-8 shrink-0 cursor-pointer items-center rounded-full border bg-cell px-3.5 text-subhead whitespace-nowrap text-text-dim transition-colors duration-200 outline-none hover:text-text focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=active]:border-transparent data-[state=active]:bg-accent-soft data-[state=active]:font-semibold data-[state=active]:text-accent-text',
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
  return <TabsPrimitive.Content className={cn('mt-4 outline-none', className)} {...props} />;
}
