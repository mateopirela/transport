import { formatMoney } from '@transport/shared';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import { moneyVariants, type MoneyVariants } from './variants';

/**
 * An amount in pesos (§1.5), from its cents: no `.00` on a whole amount, in
 * tabular digits. `numeral` is the main figure of a screen (the rail of a
 * detail, an indicator), `title` the total of a section and `inline` (the
 * default) an amount inside a line or a table cell, at the size around it.
 */
export function Money({
  cents,
  size,
  className,
  ...props
}: Omit<React.ComponentProps<'span'>, 'children'> &
  MoneyVariants & {
    cents: number | bigint | string;
  }) {
  return (
    <span className={cn(moneyVariants({ size }), className)} {...props}>
      {formatMoney(cents)}
    </span>
  );
}
