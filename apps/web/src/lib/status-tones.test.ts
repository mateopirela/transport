import {
  LOAD_STATUSES,
  PROVIDER_STATUSES,
  TRIP_STATUSES,
  VERIFICATION_STATUSES,
} from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { PILL_TONES } from '@/components/ui/variants';

import {
  loadStatusTone,
  negotiationTone,
  providerStateTone,
  requirementStateTone,
  subscriptionStatusTone,
  tripStatusTone,
  verificationTone,
} from './status-tones';

describe('status tones', () => {
  it('gives every load status a tone of the kit', () => {
    for (const status of LOAD_STATUSES) expect(PILL_TONES).toContain(loadStatusTone(status));
    expect(loadStatusTone('published')).toBe('accent');
    expect(loadStatusTone('contracted')).toBe('ok');
    expect(loadStatusTone('cancelled')).toBe('red');
    expect(loadStatusTone('draft')).toBe('neutral');
  });

  it('marks active trips with the accent, delivered ok and cancelled red', () => {
    for (const status of TRIP_STATUSES) expect(PILL_TONES).toContain(tripStatusTone(status));
    expect(tripStatusTone('in_transit')).toBe('accent');
    expect(tripStatusTone('delivered')).toBe('ok');
    expect(tripStatusTone('cancelled')).toBe('red');
    expect(tripStatusTone('closed')).toBe('neutral');
  });

  it('colours the provider decision and the verification', () => {
    for (const status of PROVIDER_STATUSES) expect(PILL_TONES).toContain(providerStateTone(status));
    expect(providerStateTone('pending')).toBe('neutral');
    expect(providerStateTone('approved')).toBe('ok');
    expect(providerStateTone('revoked')).toBe('red');
    for (const status of VERIFICATION_STATUSES) {
      expect(verificationTone(status)).toBe(status === 'approved' ? 'ok' : 'red');
    }
  });

  it('shows a document waiting for review in amber', () => {
    expect(requirementStateTone('missing')).toBe('neutral');
    expect(requirementStateTone('pending_review')).toBe('amber');
    expect(requirementStateTone('approved')).toBe('ok');
    for (const state of ['rejected', 'expired', 'suspended'] as const) {
      expect(requirementStateTone(state)).toBe('red');
    }
  });

  it('puts the turn of the shipper in a negotiation in the accent', () => {
    expect(negotiationTone('respond')).toBe('accent');
    expect(negotiationTone('accepted')).toBe('ok');
    expect(negotiationTone('awaiting_carrier')).toBe('neutral');
    expect(negotiationTone('closed')).toBe('neutral');
  });

  it('gives every subscription status a tone', () => {
    for (const status of ['pilot_free', 'active', 'past_due', 'canceled', 'none'] as const) {
      expect(PILL_TONES).toContain(subscriptionStatusTone(status));
    }
    expect(subscriptionStatusTone('pilot_free')).toBe('accent');
    expect(subscriptionStatusTone('active')).toBe('ok');
  });
});
