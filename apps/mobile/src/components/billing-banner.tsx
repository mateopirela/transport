import { billingCopy, formatDate, pilotEndingDate, showsBillingBanner } from '@transport/shared';

import { loadBillingState } from '../lib/billing-api';
import { useCarrierData, type CarrierContext } from '../lib/use-carrier';
import { Notice } from './ui';

const loadState = ({ client }: CarrierContext) => loadBillingState(client);

/**
 * The subscription notice on the carrier's home (H3): only when the pilot ends
 * in 14 days or less, or when the subscription is not active after it. Text
 * only: the app never links to the purchase (D30).
 */
export function BillingBanner() {
  const { state } = useCarrierData(loadState);
  if (state.status !== 'ready' || !state.data || !showsBillingBanner(state.data.notice)) {
    return null;
  }
  const { notice, pilot_ends_at: endsAt } = state.data;
  const ending = pilotEndingDate(endsAt);
  if (notice === 'inactive') {
    return <Notice tone="danger">{billingCopy.banner.inactive}</Notice>;
  }
  return (
    <Notice tone="warning">
      {ending
        ? billingCopy.banner.pilotEnding(formatDate(ending))
        : billingCopy.banner.pilotEndingNoDate}
    </Notice>
  );
}
