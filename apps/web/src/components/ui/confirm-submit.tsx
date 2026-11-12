'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { ButtonVariants } from '@/components/ui/variants';

/**
 * The submit button of a form that asks first (docs/plan-fulmis.md §1.5:
 * what cannot be undone, and every "Registrar" of the admin, asks in a dialog
 * that says what will happen). It sits inside the form like any submit button; pressed, it
 * opens a dialog that says what will happen, built from what the form holds
 * right then, and only the dialog's own button sends the form, with this
 * button's `name` and `value` (a decision like "approve" or "reject").
 *
 * `skip` sends the form at once instead, e.g. when a required field is still
 * empty: the server answers with the field's error, with nothing to confirm.
 *
 * Enter in a field does not send the form either: its submit button is this
 * hidden one, kept disabled until the dialog confirms.
 */
export function ConfirmSubmit({
  title,
  description,
  confirmLabel,
  destructive = false,
  skip,
  name,
  value,
  variant = 'secondary',
  size,
  loading = false,
  disabled,
  className,
  children,
}: {
  title: React.ReactNode;
  /** What will happen: fixed, or read from the form when the button is pressed. */
  description: React.ReactNode | ((data: FormData) => React.ReactNode);
  confirmLabel: React.ReactNode;
  destructive?: boolean;
  skip?: (data: FormData) => boolean;
  name?: string;
  value?: string;
  variant?: ButtonVariants['variant'];
  size?: ButtonVariants['size'];
  /** The form's action is running (the button keeps its label and spins). */
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const trigger = React.useRef<HTMLButtonElement>(null);
  const submitter = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState<React.ReactNode>(null);

  // The hidden submitter stays disabled but for this moment: a disabled
  // default button stops Enter in a field from sending the form unasked
  // (implicit submission), so the only way in is the dialog. The form data is
  // read while the submit event runs, inside requestSubmit.
  const send = () => {
    const form = trigger.current?.form;
    const button = submitter.current;
    if (!form || !button || loading) return;
    button.disabled = false;
    try {
      form.requestSubmit(button);
    } finally {
      button.disabled = true;
    }
  };

  const ask = () => {
    const form = trigger.current?.form;
    if (!form) return;
    const data = new FormData(form);
    if (name !== undefined && value !== undefined) data.set(name, value);
    if (skip?.(data)) {
      send();
      return;
    }
    setText(typeof description === 'function' ? description(data) : description);
    setOpen(true);
  };

  return (
    <>
      <Button
        ref={trigger}
        type="button"
        variant={variant}
        size={size}
        loading={loading}
        disabled={disabled}
        className={className}
        onClick={ask}
      >
        {children}
      </Button>
      {/* The button that sends the form, with this decision, once confirmed. */}
      <button
        ref={submitter}
        type="submit"
        name={name}
        value={value}
        hidden
        disabled
        tabIndex={-1}
      />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={text}
        confirmLabel={confirmLabel}
        destructive={destructive}
        onConfirm={send}
      />
    </>
  );
}
