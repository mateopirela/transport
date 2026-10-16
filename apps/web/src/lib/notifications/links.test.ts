import { NOTIFICATION_TYPES } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { chatAttachmentHref } from '../routing';
import { notificationHref } from './links';

const LOAD = '00000000-0000-4000-8000-000000000001';
const NEGOTIATION = '00000000-0000-4000-8000-000000000002';

describe('notificationHref', () => {
  it('opens the negotiation of an offer', () => {
    for (const type of ['offer_received', 'counter_offer_received', 'offer_accepted'] as const) {
      expect(notificationHref(type, { loadId: LOAD, negotiationId: NEGOTIATION })).toBe(
        `/cliente/cargas/${LOAD}/negociaciones/${NEGOTIATION}`,
      );
    }
    expect(notificationHref('offer_received', { loadId: LOAD })).toBe(`/cliente/cargas/${LOAD}`);
  });

  it('opens the trip, or its load when the trip id is missing', () => {
    expect(notificationHref('trip_status_changed', { loadId: LOAD, tripId: NEGOTIATION })).toBe(
      `/cliente/viajes/${NEGOTIATION}`,
    );
    expect(notificationHref('trip_assigned', { loadId: LOAD, tripId: 'x' })).toBe(
      `/cliente/cargas/${LOAD}`,
    );
  });

  it('ignores malformed ids and types without a screen', () => {
    expect(
      notificationHref('offer_received', { loadId: '../admin', negotiationId: 'x' }),
    ).toBeNull();
    expect(notificationHref('trip_assigned', null)).toBeNull();
    expect(notificationHref('document_rejected', { loadId: LOAD })).toBeNull();
    expect(notificationHref('trip_unassigned', { loadId: LOAD })).toBeNull();
  });

  it('handles every notification type', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(() => notificationHref(type, {})).not.toThrow();
    }
  });
});

describe('chatAttachmentHref', () => {
  it('keeps the path in the query string', () => {
    expect(chatAttachmentHref(`${LOAD}/${NEGOTIATION}.png`)).toBe(
      `/cliente/adjuntos?ruta=${LOAD}%2F${NEGOTIATION}.png`,
    );
  });
});
