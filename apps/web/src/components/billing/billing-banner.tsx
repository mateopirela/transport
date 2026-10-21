import { billingCopy, formatDate, pilotEndingDate, showsBillingBanner } from '@transport/shared';
import Link from 'next/link';

import { textLink } from '@/components/page-section';
import type { BillingState } from '@/lib/billing/queries';
import { paths } from '@/lib/routing';
import { cn } from '@/lib/utils';

const c = billingCopy.banner;

/**
 * The subscription notice on every carrier screen (H3): only when the pilot
 * ends in 14 days or less, or when the subscription is not active after it
 * (with enforcement notice or block). Nothing otherwise.
 */
export function BillingBanner({ state }: { state: BillingState | null }) {
  if (!state || !showsBillingBanner(state.notice)) return null;
  const ending = pilotEndingDate(state.pilot_ends_at);
  const text =
    state.notice === 'inactive'
      ? c.inactive
      : ending
        ? c.pilotEnding(formatDate(ending))
        : c.pilotEndingNoDate;
  return (
    <div
      role="status"
      data-testid="billing-banner"
      className={cn(
        'mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl px-4 py-3 text-subhead',
        state.notice === 'inactive' ? 'bg-red/14 text-red-text' : 'bg-amber/14 text-amber-text',
      )}
    >
      <p>{text}</p>
      <Link href={paths.carrierSubscription} className={textLink}>
        {c.link}
      </Link>
    </div>
  );
}
