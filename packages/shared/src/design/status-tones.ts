// The status tones of Fulmis (docs/plan-fulmis.md §1.1): one map for the web
// and the app. A tone says what a status asks of whoever looks at it, never
// what colour it is; the kit of each platform turns it into a filled pill.
import type { SubscriptionStatus } from '../billing';
import type {
  FreightCarrierStatus,
  FreightClientStatus,
  IncidentStatus,
  LoadStatus,
  OfferStatus,
  TripStatus,
  VerificationStatus,
} from '../enums';
import type { ProviderState } from '../shared-documents';
import { isTripActive } from '../trips';
import type { RequirementState } from '../verification';

import { palette, type Palette, type Theme } from './tokens';

/**
 * - `attention`: whoever looks has to act (an offer to review, a document to upload).
 * - `progress`: it is moving (published, negotiating, in transit).
 * - `pending`: it waits for someone else, or is about to expire.
 * - `done`: it went well (delivered, paid, verified). Quiet: no colour, a check.
 * - `problem`: overdue, rejected, an incident.
 * - `inactive`: a draft, cancelled, expired.
 */
export const STATE_TONES = [
  'attention',
  'progress',
  'pending',
  'done',
  'problem',
  'inactive',
] as const;
export type StateTone = (typeof STATE_TONES)[number];

interface ToneKeys {
  fill: keyof Palette;
  ink: keyof Palette;
  /** Only the inactive pill has a border: its fill is the page. */
  border: keyof Palette | null;
}

/** The fill and the ink of each tone, as palette keys (the table of §1.1). */
export const STATE_TONE_KEYS: Readonly<Record<StateTone, ToneKeys>> = Object.freeze({
  attention: { fill: 'accent', ink: 'accentInk', border: null },
  progress: { fill: 'infoFill', ink: 'infoInk', border: null },
  pending: { fill: 'amber', ink: 'amberInk', border: null },
  done: { fill: 'surfaceHigh', ink: 'text', border: null },
  problem: { fill: 'red', ink: 'redInk', border: null },
  inactive: { fill: 'bg', ink: 'textDim', border: 'control' },
});

/** The colours of a pill of `tone` in `theme`. */
export function stateToneColors(
  theme: Theme,
  tone: StateTone,
): { fill: string; ink: string; border: string | null } {
  const colors = palette[theme];
  const keys = STATE_TONE_KEYS[tone];
  return {
    fill: colors[keys.fill],
    ink: colors[keys.ink],
    border: keys.border ? colors[keys.border] : null,
  };
}

/** A load: moving while it is published or contracted, quiet once completed. */
export function loadStatusTone(status: LoadStatus): StateTone {
  switch (status) {
    case 'published':
    case 'negotiating':
    case 'contracted':
    case 'in_progress':
      return 'progress';
    case 'completed':
      return 'done';
    case 'draft':
    case 'cancelled':
    case 'expired':
      return 'inactive';
  }
}

/** A trip: waiting until it leaves, moving on the road, quiet once delivered. */
export function tripStatusTone(status: TripStatus): StateTone {
  if (status === 'cancelled') return 'inactive';
  if (status === 'delivered' || status === 'closed') return 'done';
  if (isTripActive(status)) return 'progress';
  return 'pending';
}

/** An offer, whoever made it; the screen decides when it is the viewer's turn. */
export function offerStatusTone(status: OfferStatus): StateTone {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'countered':
      return 'progress';
    case 'accepted':
      return 'done';
    case 'rejected':
      return 'problem';
    case 'withdrawn':
    case 'expired':
      return 'inactive';
  }
}

/** The verification of a company or a document. */
export function verificationStatusTone(status: VerificationStatus): StateTone {
  switch (status) {
    case 'pending_review':
      return 'pending';
    case 'approved':
      return 'done';
    case 'rejected':
    case 'expired':
    case 'suspended':
      return 'problem';
  }
}

/** A required document: one that is missing asks its owner to upload it. */
export function requirementStateTone(state: RequirementState): StateTone {
  return state === 'missing' ? 'attention' : verificationStatusTone(state);
}

/** A shipper's decision about a carrier as its provider. */
export function providerStateTone(state: ProviderState): StateTone {
  switch (state) {
    case 'pending':
      return 'pending';
    case 'approved':
      return 'done';
    case 'rejected':
    case 'revoked':
      return 'problem';
  }
}

/** A subscription: the free pilot is running, an unpaid one is a problem. */
export function subscriptionTone(status: SubscriptionStatus): StateTone {
  switch (status) {
    case 'pilot_free':
      return 'progress';
    case 'active':
      return 'done';
    case 'past_due':
      return 'problem';
    case 'canceled':
    case 'none':
      return 'inactive';
  }
}

/** What the client owes for a trip. */
export function freightClientTone(status: FreightClientStatus): StateTone {
  switch (status) {
    case 'pending':
    case 'invoiced':
      return 'pending';
    case 'paid':
      return 'done';
    case 'overdue':
      return 'problem';
    case 'written_off':
    case 'cancelled':
      return 'inactive';
  }
}

/** What the carrier is owed for a trip. */
export function freightCarrierTone(status: FreightCarrierStatus): StateTone {
  switch (status) {
    case 'pending':
    case 'on_hold':
      return 'pending';
    case 'quick_pay_requested':
    case 'scheduled':
      return 'progress';
    case 'paid':
      return 'done';
    case 'cancelled':
      return 'inactive';
  }
}

/** An incident of a trip. */
export function incidentStatusTone(status: IncidentStatus): StateTone {
  return status === 'open' ? 'problem' : 'done';
}
