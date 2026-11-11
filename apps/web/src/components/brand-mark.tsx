import { PLATFORM_NAME } from '@transport/shared';

import { cn } from '@/lib/utils';

/**
 * The wordmark (§1.4): the accent square and the name, in Geist 600. For the
 * brand surfaces (the sidebar, the brand panel of the access), which are
 * Night in both themes.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 text-brand-text', className)}>
      <span aria-hidden className="size-3 shrink-0 bg-brand-accent" />
      <span className="text-headline font-semibold tracking-[-0.03em]">{PLATFORM_NAME}</span>
    </span>
  );
}
