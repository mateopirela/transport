'use client';

import { formatMoney, parsePesosToCents } from '@transport/shared';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { ButtonVariants } from '@/components/ui/variants';

/**
 * The submit button of an admin form that asks first (docs/plan-fulmis.md
 * §1.5 and §2 V5: no action with an effect on money or on accounts runs with
 * one click). It sits inside the form like any submit button; pressed, it
 * opens a dialog that says what will happen, built from what the form holds
 * right then, and only the dialog's own button sends the form, with this
 * button's `name` and `value` (a decision like "approve" or "reject").
 *
 * `skip` sends the form at once instead, e.g. when a required field is still
 * empty: the server answers with the field's error, with nothing to confirm.
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

  const send = () => {
    const form = trigger.current?.form;
    if (!form) return;
    if (submitter.current) form.requestSubmit(submitter.current);
    else form.requestSubmit();
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
      <button ref={submitter} type="submit" name={name} value={value} hidden tabIndex={-1} />
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

/** The text of a form field, trimmed ("" when it is missing or a file). */
export function formText(data: FormData, field: string): string {
  const entry = data.get(field);
  return typeof entry === 'string' ? entry.trim() : '';
}

/** An amount of a form field written as money ("$38,000"), or null when it is not one. */
export function formAmount(data: FormData, field: string): string | null {
  const cents = parsePesosToCents(formText(data, field));
  return cents === null ? null : formatMoney(cents);
}
