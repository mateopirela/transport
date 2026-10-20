import {
  isTripActive,
  type LoadStatus,
  type ProviderState,
  type RequirementState,
  type TripStatus,
  type VerificationStatus,
} from '@transport/shared';

import type { PillTone } from '@/components/ui/variants';
import type { NegotiationState } from '@/lib/offers/board';

/*
 * The pill tone of each status the shipper's screens show (§1.1): the accent
 * while something is open or moving, ok once it went well, amber while it
 * waits for someone, red when it failed or was stopped, neutral otherwise.
 */

export function loadStatusTone(status: LoadStatus): PillTone {
  switch (status) {
    case 'published':
    case 'negotiating':
      return 'accent';
    case 'contracted':
    case 'in_progress':
      return 'ok';
    case 'cancelled':
      return 'red';
    case 'draft':
    case 'completed':
    case 'expired':
      return 'neutral';
  }
}

export function tripStatusTone(status: TripStatus): PillTone {
  if (status === 'cancelled') return 'red';
  if (status === 'delivered') return 'ok';
  if (isTripActive(status)) return 'accent';
  return 'neutral';
}

export function providerStateTone(state: ProviderState): PillTone {
  switch (state) {
    case 'approved':
      return 'ok';
    case 'pending':
      return 'neutral';
    case 'rejected':
    case 'revoked':
      return 'red';
  }
}

/** A carrier's verification, as the shipper sees it: verified or not. */
export function verificationTone(status: VerificationStatus): PillTone {
  return status === 'approved' ? 'ok' : 'red';
}

export function requirementStateTone(state: RequirementState): PillTone {
  switch (state) {
    case 'missing':
      return 'neutral';
    case 'pending_review':
      return 'amber';
    case 'approved':
      return 'ok';
    case 'rejected':
    case 'expired':
    case 'suspended':
      return 'red';
  }
}

/** A negotiation, as the shipper sees it: their turn in the accent, a deal in ok. */
export function negotiationTone(state: NegotiationState): PillTone {
  switch (state) {
    case 'respond':
      return 'accent';
    case 'accepted':
      return 'ok';
    case 'awaiting_carrier':
    case 'closed':
      return 'neutral';
  }
}
