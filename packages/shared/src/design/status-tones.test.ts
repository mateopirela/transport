import { describe, expect, it } from 'vitest';

import {
  FREIGHT_CARRIER_STATUSES,
  FREIGHT_CLIENT_STATUSES,
  INCIDENT_STATUSES,
  LOAD_STATUSES,
  OFFER_STATUSES,
  PROVIDER_STATUSES,
  TRIP_STATUSES,
  VERIFICATION_STATUSES,
} from '../enums';
import { ACTIVE_TRIP_STATUSES } from '../trips';

import {
  freightCarrierTone,
  freightClientTone,
  incidentStatusTone,
  loadStatusTone,
  offerStatusTone,
  providerStateTone,
  requirementStateTone,
  STATE_TONE_KEYS,
  STATE_TONES,
  stateToneColors,
  subscriptionTone,
  tripStatusTone,
  verificationStatusTone,
} from './status-tones';
import { contrastRatio, palette, THEMES } from './tokens';

const SUBSCRIPTION_STATUSES = ['pilot_free', 'active', 'past_due', 'canceled', 'none'] as const;

describe('the six tones (§1.1)', () => {
  it('are attention, progress, pending, done, problem and inactive', () => {
    expect(STATE_TONES).toEqual([
      'attention',
      'progress',
      'pending',
      'done',
      'problem',
      'inactive',
    ]);
    expect(Object.keys(STATE_TONE_KEYS).sort()).toEqual([...STATE_TONES].sort());
  });

  it('take the fill and the ink of the table', () => {
    expect(STATE_TONE_KEYS.attention).toMatchObject({ fill: 'accent', ink: 'accentInk' });
    expect(STATE_TONE_KEYS.progress).toMatchObject({ fill: 'infoFill', ink: 'infoInk' });
    expect(STATE_TONE_KEYS.pending).toMatchObject({ fill: 'amber', ink: 'amberInk' });
    expect(STATE_TONE_KEYS.done).toMatchObject({ fill: 'surfaceHigh', ink: 'text' });
    expect(STATE_TONE_KEYS.problem).toMatchObject({ fill: 'red', ink: 'redInk' });
    expect(STATE_TONE_KEYS.inactive).toEqual({ fill: 'bg', ink: 'textDim', border: 'control' });
  });

  it.each(THEMES)('reach AA with their ink in %s', (theme) => {
    for (const tone of STATE_TONES) {
      const { fill, ink, border } = stateToneColors(theme, tone);
      expect(contrastRatio(ink, fill), `${tone} in ${theme}`).toBeGreaterThanOrEqual(4.5);
      // The pill with a border sits on a cell too: the border has to be seen there.
      if (border) {
        expect(contrastRatio(border, palette[theme].cell)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('never write the accent as the ink', () => {
    for (const tone of STATE_TONES) {
      expect(['accent', 'accentText']).not.toContain(STATE_TONE_KEYS[tone].ink);
    }
    // No green: done is quiet, on the neutral surface.
    expect(STATE_TONE_KEYS.done.fill).toBe('surfaceHigh');
  });
});

describe('the tone of each status of the domain', () => {
  it('gives every status a tone', () => {
    const cases: [readonly string[], (status: never) => string][] = [
      [LOAD_STATUSES, loadStatusTone],
      [TRIP_STATUSES, tripStatusTone],
      [OFFER_STATUSES, offerStatusTone],
      [VERIFICATION_STATUSES, verificationStatusTone],
      [['missing', ...VERIFICATION_STATUSES], requirementStateTone],
      [['pending', ...PROVIDER_STATUSES], providerStateTone],
      [SUBSCRIPTION_STATUSES, subscriptionTone],
      [FREIGHT_CLIENT_STATUSES, freightClientTone],
      [FREIGHT_CARRIER_STATUSES, freightCarrierTone],
      [INCIDENT_STATUSES, incidentStatusTone],
    ];
    for (const [statuses, toneOf] of cases) {
      for (const status of statuses) {
        expect(STATE_TONES, status).toContain(toneOf(status as never));
      }
    }
  });

  it('shows a load moving while it is open and quiet once it ends', () => {
    expect(loadStatusTone('published')).toBe('progress');
    expect(loadStatusTone('negotiating')).toBe('progress');
    expect(loadStatusTone('in_progress')).toBe('progress');
    expect(loadStatusTone('completed')).toBe('done');
    for (const status of ['draft', 'cancelled', 'expired'] as const) {
      expect(loadStatusTone(status)).toBe('inactive');
    }
  });

  it('shows a trip on the road in progress, delivered done and cancelled inactive', () => {
    for (const status of ACTIVE_TRIP_STATUSES) expect(tripStatusTone(status)).toBe('progress');
    expect(tripStatusTone('pending_assignment')).toBe('pending');
    expect(tripStatusTone('assigned')).toBe('pending');
    expect(tripStatusTone('delivered')).toBe('done');
    expect(tripStatusTone('closed')).toBe('done');
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

  it('marks what is overdue, rejected or an open incident as a problem', () => {
    expect(freightClientTone('overdue')).toBe('problem');
    expect(subscriptionTone('past_due')).toBe('problem');
    expect(offerStatusTone('rejected')).toBe('problem');
    expect(providerStateTone('revoked')).toBe('problem');
    expect(incidentStatusTone('open')).toBe('problem');
    expect(incidentStatusTone('resolved')).toBe('done');
  });

  it('keeps money that is owed pending and paid money done', () => {
    expect(freightClientTone('pending')).toBe('pending');
    expect(freightClientTone('invoiced')).toBe('pending');
    expect(freightClientTone('paid')).toBe('done');
    expect(freightCarrierTone('on_hold')).toBe('pending');
    expect(freightCarrierTone('scheduled')).toBe('progress');
    expect(freightCarrierTone('paid')).toBe('done');
    expect(freightCarrierTone('cancelled')).toBe('inactive');
  });

  it('never asks for attention on its own: only a screen knows whose turn it is', () => {
    for (const status of LOAD_STATUSES) expect(loadStatusTone(status)).not.toBe('attention');
    for (const status of TRIP_STATUSES) expect(tripStatusTone(status)).not.toBe('attention');
    for (const status of OFFER_STATUSES) expect(offerStatusTone(status)).not.toBe('attention');
  });
});
