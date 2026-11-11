import {
  FREIGHT_CARRIER_STATUSES,
  FREIGHT_CLIENT_STATUSES,
  INCIDENT_STATUSES,
  LOAD_STATUSES,
  OFFER_STATUSES,
  PROVIDER_STATUSES,
  TRIP_STATUSES,
  VERIFICATION_STATUSES,
} from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { PILL_TONES } from '@/components/ui/variants';

import {
  freightCarrierTone,
  freightClientTone,
  incidentStatusTone,
  loadStatusTone,
  negotiationTone,
  offerStatusTone,
  providerStateTone,
  requirementStateTone,
  subscriptionStatusTone,
  tripStatusTone,
  verificationStatusTone,
  verificationTone,
} from './status-tones';

describe('status tones', () => {
  it('gives every status of the domain a tone the pill can draw', () => {
    for (const status of LOAD_STATUSES) expect(PILL_TONES).toContain(loadStatusTone(status));
    for (const status of TRIP_STATUSES) expect(PILL_TONES).toContain(tripStatusTone(status));
    for (const status of OFFER_STATUSES) expect(PILL_TONES).toContain(offerStatusTone(status));
    for (const status of PROVIDER_STATUSES) {
      expect(PILL_TONES).toContain(providerStateTone(status));
    }
    for (const status of VERIFICATION_STATUSES) {
      expect(PILL_TONES).toContain(verificationStatusTone(status));
      expect(PILL_TONES).toContain(requirementStateTone(status));
    }
    for (const status of FREIGHT_CLIENT_STATUSES) {
      expect(PILL_TONES).toContain(freightClientTone(status));
    }
    for (const status of FREIGHT_CARRIER_STATUSES) {
      expect(PILL_TONES).toContain(freightCarrierTone(status));
    }
    for (const status of INCIDENT_STATUSES) {
      expect(PILL_TONES).toContain(incidentStatusTone(status));
    }
  });

  it('reads the shared map: moving in progress, delivered done, cancelled inactive', () => {
    expect(loadStatusTone('published')).toBe('progress');
    expect(loadStatusTone('completed')).toBe('done');
    expect(loadStatusTone('draft')).toBe('inactive');
    expect(tripStatusTone('in_transit')).toBe('progress');
    expect(tripStatusTone('delivered')).toBe('done');
    expect(tripStatusTone('cancelled')).toBe('inactive');
  });

  it('asks for a missing document and waits for one in review', () => {
    expect(requirementStateTone('missing')).toBe('attention');
    expect(requirementStateTone('pending_review')).toBe('pending');
    expect(requirementStateTone('approved')).toBe('done');
    for (const state of ['rejected', 'expired', 'suspended'] as const) {
      expect(requirementStateTone(state)).toBe('problem');
    }
  });

  it('shows a carrier to the shipper as verified or not', () => {
    for (const status of VERIFICATION_STATUSES) {
      expect(verificationTone(status)).toBe(status === 'approved' ? 'done' : 'problem');
    }
  });

  it('puts the turn of the shipper in a negotiation in attention', () => {
    expect(negotiationTone('respond')).toBe('attention');
    expect(negotiationTone('accepted')).toBe('done');
    expect(negotiationTone('awaiting_carrier')).toBe('pending');
    expect(negotiationTone('closed')).toBe('inactive');
  });

  it('gives every subscription status a tone', () => {
    for (const status of ['pilot_free', 'active', 'past_due', 'canceled', 'none'] as const) {
      expect(PILL_TONES).toContain(subscriptionStatusTone(status));
    }
    expect(subscriptionStatusTone('pilot_free')).toBe('progress');
    expect(subscriptionStatusTone('active')).toBe('done');
    expect(subscriptionStatusTone('past_due')).toBe('problem');
  });
});
