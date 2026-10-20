'use client';

import { uiCopy } from '@transport/shared';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/*
 * Dialogs and sheets (§1.5, §1.6) on Radix: a centred dialog to confirm or
 * fill a short form, and a side sheet (admin). Both on the cell colour with a
 * hairline, over a page that blurs; no shadow.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-bg/70 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

/** The round close button in the corner of a dialog or a sheet. */
export function CloseButton({ className }: { className?: string }) {
  return (
    <DialogPrimitive.Close
      aria-label={uiCopy.close}
      className={cn(
        'flex size-8 cursor-pointer items-center justify-center rounded-full bg-surface-high text-text-dim transition-colors hover:text-text focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
        className,
      )}
    >
      <X aria-hidden className="size-4" />
    </DialogPrimitive.Close>
  );
}

/** A centred dialog: the title, an optional line under it, the content. */
export function DialogContent({
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
          'fixed top-1/2 left-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-cell p-6 text-text duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <DialogPrimitive.Title className="text-title3">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-subhead text-text-dim">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <CloseButton className="-mt-1 -mr-2" />
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** The buttons at the end of a dialog: the primary last, on the right. */
export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}
