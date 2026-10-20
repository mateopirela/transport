import type * as React from 'react';

import { cn } from '@/lib/utils';

export type NoticeTone = 'error' | 'success' | 'info';

/**
 * A short message in the flow of a screen (§1.6): `info` on the highlight,
 * `success` and `error` on their tone at 14 %. Errors are announced at once.
 */
export function Notice({
  tone,
  className,
  children,
}: {
  tone: NoticeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-2xl px-4 py-3 text-subhead',
        tone === 'error' && 'bg-red/14 text-red-text',
        tone === 'success' && 'bg-ok/14 text-ok-text',
        tone === 'info' && 'bg-highlight text-text',
        className,
      )}
    >
      {children}
    </p>
  );
}
