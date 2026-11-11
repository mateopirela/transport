import { Check, CircleAlert, Clock, Info, type LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

export type NoticeTone = 'error' | 'success' | 'info' | 'attention' | 'pending';

/**
 * The fill and the ink of each tone (§1.1), like a pill's: `error` on the red,
 * `pending` on the amber, `success` quiet on the neutral surface (no green),
 * `info` a cell with a hairline and `attention` the same cell edged in the
 * accent, which never becomes small text.
 */
const TONES: Record<NoticeTone, { box: string; icon: LucideIcon; iconClass?: string }> = {
  error: { box: 'bg-red text-red-ink', icon: CircleAlert },
  success: { box: 'bg-surface-high text-text', icon: Check },
  info: { box: 'border bg-cell text-text', icon: Info, iconClass: 'text-text-dim' },
  attention: {
    box: 'border border-accent bg-cell text-text',
    icon: CircleAlert,
    iconClass: 'text-accent-text',
  },
  pending: { box: 'bg-amber text-amber-ink', icon: Clock },
};

/**
 * A short message in the flow of a screen. Its tone is never the colour
 * alone: each one carries its icon. Errors are announced at once.
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
  const { box, icon: Icon, iconClass } = TONES[tone];
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-2.5 px-4 py-3 text-subhead', box, className)}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', iconClass)} />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}
