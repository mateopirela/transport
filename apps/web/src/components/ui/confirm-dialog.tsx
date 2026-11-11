'use client';

import { uiCopy } from '@transport/shared';
import * as React from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from './button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from './dialog';
import { Notice } from './notice';

/** The button that confirms: busy while its form is being sent. */
function ConfirmSubmit({
  destructive,
  pending,
  children,
}: {
  destructive: boolean;
  pending: boolean | undefined;
  children: React.ReactNode;
}) {
  const status = useFormStatus();
  return (
    <Button
      type="submit"
      variant={destructive ? 'danger' : 'primary'}
      loading={pending ?? status.pending}
    >
      {children}
    </Button>
  );
}

/**
 * The confirmation of an irreversible action (§1.5): cancel, reject, archive,
 * pay. The `trigger` (a button of the page) opens a dialog that says what
 * will happen and asks again; only its own button runs the action.
 *
 * Two ways to run it:
 * - `action`: a server action, or the dispatcher of `useActionState`. The
 *   dialog is its form: `children` are its fields and hidden inputs, `pending`
 *   and `error` come from the action's state. It stays open while it runs and
 *   to show the error; on success the page changes under it, or the caller
 *   closes it with `open`.
 * - `onConfirm`: a callback of the client. The dialog closes when it ends,
 *   unless it returns `false`.
 *
 * `destructive` paints the button that confirms in red (what cancels, rejects
 * or removes); otherwise it is the primary of the dialog.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = uiCopy.cancel,
  destructive = false,
  action,
  onConfirm,
  pending,
  error,
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  /** The button that opens the dialog; omit it when `open` is controlled. */
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel?: React.ReactNode;
  destructive?: boolean;
  action?: (formData: FormData) => void | Promise<void>;
  /** Runs on confirm; return (or resolve to) `false` to keep the dialog open. */
  onConfirm?: () => unknown;
  pending?: boolean;
  error?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const [ownOpen, setOwnOpen] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const confirm = async () => {
    if (!onConfirm) {
      // Nothing to run: the caller reads the answer from `onOpenChange`.
      setOpen(false);
      return;
    }
    setRunning(true);
    try {
      const result = await onConfirm();
      if (result !== false) setOpen(false);
    } finally {
      setRunning(false);
    }
  };

  const body = (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      {children && <div className="space-y-4">{children}</div>}
      <DialogFooter className={error || children ? undefined : 'mt-0'}>
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            {cancelLabel}
          </Button>
        </DialogClose>
        {action ? (
          <ConfirmSubmit destructive={destructive} pending={pending}>
            {confirmLabel}
          </ConfirmSubmit>
        ) : (
          <Button
            type="button"
            variant={destructive ? 'danger' : 'primary'}
            loading={pending ?? running}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        )}
      </DialogFooter>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent title={title} description={description} role="alertdialog">
        {action ? (
          <form action={action} className="space-y-4" noValidate>
            {body}
          </form>
        ) : (
          <div className="space-y-4">{body}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
