import {
  subscriptionTone,
  type StateTone,
  type SubscriptionStatus,
  type VerificationStatus,
} from '@transport/shared';

import type { NegotiationState } from '@/lib/offers/board';

/*
 * The tone of each status the web shows (docs/plan-fulmis.md §1.1). The map
 * of the domain lives in `@transport/shared` (design/status-tones.ts), one for
 * the web and the app; here are only the readings that belong to a screen of
 * the web.
 */

export {
  freightCarrierTone,
  freightClientTone,
  incidentStatusTone,
  loadStatusTone,
  offerStatusTone,
  providerStateTone,
  requirementStateTone,
  tripStatusTone,
  verificationStatusTone,
} from '@transport/shared';

/** A carrier's verification, as the shipper sees it: verified or not. */
export function verificationTone(status: VerificationStatus): StateTone {
  return status === 'approved' ? 'done' : 'problem';
}

/**
 * A negotiation, as the shipper sees it: their turn asks them to act, a deal
 * is done, and it waits while the carrier has to answer.
 */
export function negotiationTone(state: NegotiationState): StateTone {
  switch (state) {
    case 'respond':
      return 'attention';
    case 'accepted':
      return 'done';
    case 'awaiting_carrier':
      return 'pending';
    case 'closed':
      return 'inactive';
  }
}

/** A subscription (H3). */
export function subscriptionStatusTone(status: SubscriptionStatus): StateTone {
  return subscriptionTone(status);
}
