import { ChevronDown } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import {
  disclosureBody,
  disclosureFrame,
  disclosureSummary,
  type DisclosureTone,
} from './disclosure-variants';

/**
 * An action folded in a cell until opened (a native `<details>`): the row
 * says what it does in its tone, the chevron turns, and the form opens under
 * a hairline. A stray click never sends anything.
 */
export function Disclosure({
  summary,
  tone,
  open,
  className,
  children,
}: {
  summary: string;
  tone?: DisclosureTone;
  open?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details className={cn(disclosureFrame, className)} open={open}>
      <summary className={disclosureSummary({ tone })}>
        <span>{summary}</span>
        <ChevronDown
          aria-hidden
          className="size-4.5 shrink-0 text-text-faint transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className={disclosureBody}>{children}</div>
    </details>
  );
}
