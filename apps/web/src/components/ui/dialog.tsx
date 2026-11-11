'use client';

import { uiCopy } from '@transport/shared';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import { focusRing } from './variants';

/*
 * Dialogs and sheets (§1.3, §1.5) on Radix: a centred dialog to confirm or
 * fill a short form, and a side sheet (admin). Both a cell with a hairline and
 * no radius, over the page dimmed with Night; no shadow, no blur.
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
        'fixed inset-0 z-50 bg-brand-bg/60 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

/** The close button in the corner of a dialog or a sheet. */
export function CloseButton({ className }: { className?: string }) {
  return (
    <DialogPrimitive.Close
      aria-label={uiCopy.close}
      className={cn(
        'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-text-dim transition-colors hover:bg-surface-high hover:text-text',
        focusRing,
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
          'fixed top-1/2 left-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-cell p-6 text-subhead text-text duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="space-y-2">
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
