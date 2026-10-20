'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import { CloseButton, DialogOverlay } from './dialog';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

/**
 * A side sheet (§1.5: admin only): slides in from the right, the whole height,
 * 420 px wide (the whole width on a phone), and scrolls on its own.
 */
export function SheetContent({
  title,
  description,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Content>, 'title'> & {
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto border-l bg-bg text-text duration-250 sm:max-w-105 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-glass-line bg-glass px-6 py-4 backdrop-blur-xl">
          <div className="space-y-1">
            <DialogPrimitive.Title className="text-title3">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-subhead text-text-dim">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <CloseButton className="-mr-2" />
        </div>
        <div className="flex-1 space-y-6 px-6 py-6">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
