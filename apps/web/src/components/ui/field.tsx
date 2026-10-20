import type * as React from 'react';

import { cn } from '@/lib/utils';

import { Label } from './label';

/** The id of a field's hint or error, for the control's `aria-describedby`. */
export function fieldHelpId(id: string): string {
  return `${id}-help`;
}

/**
 * A field (§1.6): the label above, the control, and under it the error in red
 * or a hint. The control is the child; give it `id={htmlFor}` and, when there
 * is a hint or an error, `aria-describedby={fieldHelpId(htmlFor)}`.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const help = error ?? hint;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="block px-1">
        {label}
      </Label>
      {children}
      {help && (
        <p
          id={fieldHelpId(htmlFor)}
          className={cn('px-1 text-footnote', error ? 'text-red-text' : 'text-text-dim')}
        >
          {help}
        </p>
      )}
    </div>
  );
}

/** An error on its own (a group of radios, a form's line): footnote in red. */
export function ErrorText({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('px-1 text-footnote text-red-text', className)} {...props} />;
}
