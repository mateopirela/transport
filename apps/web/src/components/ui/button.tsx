import { LoaderCircle } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import { buttonVariants, type ButtonVariants } from './variants';

export { buttonVariants };

/**
 * A button (§1.3): radius 8, 40 px. `loading` keeps its label, shows the
 * spinner (the only place a spinner goes) and stops further clicks.
 */
export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<'button'> & ButtonVariants & { loading?: boolean }) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      // Busy means disabled too: neither a click nor Enter/Space runs it again.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle aria-hidden className="animate-spin" />}
      {children}
    </button>
  );
}
