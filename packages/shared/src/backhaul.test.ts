import { describe, expect, it } from 'vitest';

import {
  BACKHAUL_PROXIMITY_KM,
  BACKHAUL_SUGGESTIONS,
  backhaulSuggestions,
  isBackhaulTripStatus,
  shouldCheckBackhaul,
  type BackhaulCheck,
} from './backhaul';
import { toRecommendation } from './carrier-loads';
import { backhaulCopy } from './copy/backhaul';
import { matchExplanation } from './copy/matching';
import { notificationContent } from './copy/notifications';
import { TRIP_STATUSES } from './enums';
import { haversineKm } from './geo';
import { recommend, type MatchCandidate } from './matching';

const NOW = new Date('2026-11-10T12:00:00Z');
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

const GDL = { city: 'Guadalajara', state: 'Jalisco', lat: 20.6597, lng: -103.3496 };
const MTY = { city: 'Monterrey', state: 'Nuevo León', lat: 25.6866, lng: -100.3161 };

describe('shouldCheckBackhaul (mirror of check_backhaul)', () => {
  const notified: BackhaulCheck = { source: 'proximity', notifiedAt: at(0) };
  const emptyProximity: BackhaulCheck = { source: 'proximity', notifiedAt: null };
  const emptyArrival: BackhaulCheck = { source: 'arrival', notifiedAt: null };

  it('checks a trip within 50 km of its destination, and not farther', () => {
    const base = { source: 'proximity', status: 'in_transit', previous: null } as const;
    expect(shouldCheckBackhaul({ ...base, distanceKm: 49.9 })).toBe(true);
    expect(shouldCheckBackhaul({ ...base, distanceKm: BACKHAUL_PROXIMITY_KM })).toBe(true);
    expect(shouldCheckBackhaul({ ...base, distanceKm: 50.1 })).toBe(false);
    expect(shouldCheckBackhaul({ ...base, distanceKm: null })).toBe(false);
    expect(shouldCheckBackhaul({ ...base, distanceKm: Number.NaN })).toBe(false);
  });

  it('measures the same points as the pgTAP test: ~45 km checks, ~60 km does not', () => {
    const near = haversineKm({ lat: 21.0644, lng: GDL.lng }, GDL);
    const far = haversineKm({ lat: 21.1993, lng: GDL.lng }, GDL);
    expect(near).toBeGreaterThan(44);
    expect(near).toBeLessThan(BACKHAUL_PROXIMITY_KM);
    expect(far).toBeGreaterThan(BACKHAUL_PROXIMITY_KM);
  });

  it('checks once per trip: a location never checks again a checked trip', () => {
    for (const previous of [notified, emptyProximity, emptyArrival]) {
      expect(
        shouldCheckBackhaul({
          source: 'proximity',
          status: 'in_transit',
          distanceKm: 10,
          previous,
        }),
      ).toBe(false);
    }
  });

  it('the arrival checks a new trip or one whose proximity check found nothing', () => {
    const base = { source: 'arrival', status: 'in_transit' } as const;
    expect(shouldCheckBackhaul({ ...base, previous: null })).toBe(true);
    expect(shouldCheckBackhaul({ ...base, previous: emptyProximity })).toBe(true);
    expect(shouldCheckBackhaul({ ...base, previous: notified })).toBe(false);
    expect(shouldCheckBackhaul({ ...base, previous: emptyArrival })).toBe(false);
  });

  it('only from the end of the loading until the unloading ends', () => {
    const checked = TRIP_STATUSES.filter((status) =>
      shouldCheckBackhaul({ source: 'arrival', status, previous: null }),
    );
    expect(checked).toEqual(['in_transit', 'at_delivery', 'unloading']);
    expect(isBackhaulTripStatus('delivered')).toBe(false);
  });
});

function candidate(overrides: Partial<MatchCandidate>): MatchCandidate {
  return {
    loadId: 'load',
    vehicleId: 'cs53-01',
    start: GDL,
    availableFrom: at(2),
    isReturnTrip: true,
    origin: GDL,
    destination: MTY,
    pickupWindowStart: at(6),
    pickupWindowEnd: at(30),
    proposedPriceCents: 3_900_000,
    homeDistanceKm: 10,
    matchedRoute: null,
    ...overrides,
  };
}

describe('backhaulSuggestions', () => {
  it('keeps the best return loads of the unit, at most 3, best first', async () => {
    const scored = await recommend(
      [
        candidate({ loadId: 'far', origin: { ...GDL, lat: 21.2, lng: -103.9 } }),
        candidate({ loadId: 'near' }),
        candidate({ loadId: 'mid', origin: { ...GDL, lat: 20.9, lng: -103.5 } }),
        candidate({ loadId: 'farther', origin: { ...GDL, lat: 21.5, lng: -104.2 } }),
        // Not a return trip: never in "Para el regreso".
        candidate({
          loadId: 'local',
          isReturnTrip: false,
          start: MTY,
          origin: MTY,
          destination: GDL,
        }),
      ],
      { now: NOW },
    );
    const recommendations = scored.map((m) => toRecommendation(m, matchExplanation(m.breakdown)));
    const suggestions = backhaulSuggestions('cs53-01', recommendations);
    expect(suggestions).toHaveLength(BACKHAUL_SUGGESTIONS);
    expect(suggestions.map((r) => r.loadId)).toEqual(['near', 'mid', 'far']);
    expect(suggestions.every((r) => r.breakdown.isReturnTrip)).toBe(true);
  });

  it('is empty without return loads', () => {
    expect(backhaulSuggestions('cs53-01', [])).toEqual([]);
  });
});

describe('backhaul_suggestions notification', () => {
  it('says how many loads, where and for which unit', () => {
    const data = { tripId: 't', vehicleLabel: 'CS53-01', city: 'Guadalajara', loadCount: 3 };
    expect(notificationContent('backhaul_suggestions', data)).toEqual({
      title: 'Carga de regreso',
      body: '3 cargas cerca de Guadalajara para cuando la unidad CS53-01 quede libre.',
    });
    expect(notificationContent('backhaul_suggestions', { ...data, loadCount: 1 }).body).toBe(
      '1 carga cerca de Guadalajara para cuando la unidad CS53-01 quede libre.',
    );
  });

  it('reads well with missing data', () => {
    expect(notificationContent('backhaul_suggestions', {}).body).toBe(
      'Hay cargas cerca de tu destino para cuando tu unidad quede libre.',
    );
    expect(notificationContent('backhaul_suggestions', null).title).toBe(
      backhaulCopy.notificationTitle,
    );
  });

  it('carries no money (I.0.3)', () => {
    const body = notificationContent('backhaul_suggestions', {
      loadCount: 2,
      city: 'Guadalajara',
      amountCents: 1_000_000,
    }).body;
    expect(body).not.toContain('$');
  });

  it('describes the section with and without the time the unit is free', () => {
    expect(backhaulCopy.description('Guadalajara', '10 nov, 14:00')).toBe(
      'Cargas compatibles cerca de Guadalajara para cuando la unidad quede libre (10 nov, 14:00).',
    );
    expect(backhaulCopy.description('Guadalajara', null)).toBe(
      'Cargas compatibles cerca de Guadalajara para cuando la unidad quede libre.',
    );
  });
});
