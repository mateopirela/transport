import { ChevronDown } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import {
  disclosureBodyVariants,
  disclosureSummaryVariants,
  disclosureVariants,
  type DisclosureVariants,
} from './disclosure-variants';

/**
 * An action folded behind its label (§1.6, U8): a native `<details>`, so it
 * opens with the keyboard and without JavaScript, drawn as a cell (or as a
 * line of text in a table). The content (a confirmation, a short form) goes
 * under the label. Use it for what must not run on a stray click: archive,
 * remove, reject, accept.
 */
export function Disclosure({
  summary,
  look,
  tone,
  open,
  className,
  children,
}: DisclosureVariants & {
  summary: React.ReactNode;
  /** Opened from the start (e.g. to show an error of its form). */
  open?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details className={cn(disclosureVariants({ look }), className)} open={open}>
      <summary className={disclosureSummaryVariants({ look, tone })}>
        <span>{summary}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'shrink-0 transition-transform duration-200 group-open/disclosure:rotate-180',
            look === 'inline' ? 'size-3.5' : 'size-4.5 text-text-faint',
          )}
        />
      </summary>
      <div className={disclosureBodyVariants({ look })}>{children}</div>
    </details>
  );
}
