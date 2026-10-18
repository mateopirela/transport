import { describe, expect, it } from 'vitest';

import { locationConsentCopy, trackingCopy } from './copy/tracking';
import { TRIP_STATUSES } from './enums';
import {
  DEFAULT_TRACKING_CONFIG as config,
  LOCATION_CONSENT_VERSION,
  shouldFlush,
  thinPoints,
  toTrackPoint,
  trackingConfigFromEnv,
  trackingDecision,
  locationAdvice,
  type RawFix,
  type TrackPoint,
} from './tracking';
import { ACTIVE_TRIP_STATUSES, MAX_LOCATION_BATCH } from './trips';

const T0 = Date.parse('2026-10-15T12:00:00.000Z');

function fix(overrides: Partial<RawFix['coords']> = {}, timestamp = T0): RawFix {
  return {
    timestamp,
    coords: {
      latitude: 25.7,
      longitude: -100.3,
      accuracy: 12,
      speed: 20,
      heading: 180,
      ...overrides,
    },
  };
}

function point(secondsAfterT0: number, lat = 25.7, lng = -100.3): TrackPoint {
  return {
    recordedAt: new Date(T0 + secondsAfterT0 * 1000).toISOString(),
    lat,
    lng,
    accuracyM: 10,
    speedMps: null,
    headingDeg: null,
  };
}

describe('tracking config', () => {
  it('defaults to ~60 s or 500 m and batches the RPC accepts', () => {
    expect(config.intervalMs).toBe(60_000);
    expect(config.distanceM).toBe(500);
    expect(config.batchSize).toBe(MAX_LOCATION_BATCH);
  });

  it('reads the interval and distance from the environment within bounds', () => {
    expect(trackingConfigFromEnv({ intervalS: '120', distanceM: '1000' })).toMatchObject({
      intervalMs: 120_000,
      distanceM: 1000,
    });
    for (const bad of ['', ' ', 'abc', '5', '601', '30.5']) {
      expect(trackingConfigFromEnv({ intervalS: bad }).intervalMs).toBe(60_000);
    }
    expect(trackingConfigFromEnv({ distanceM: '50' }).distanceM).toBe(500);
    expect(trackingConfigFromEnv({})).toEqual(config);
  });
});

describe('toTrackPoint', () => {
  it('maps a fix to the RPC point', () => {
    expect(toTrackPoint(fix(), config)).toEqual({
      recordedAt: '2026-10-15T12:00:00.000Z',
      lat: 25.7,
      lng: -100.3,
      accuracyM: 12,
      speedMps: 20,
      headingDeg: 180,
    });
  });

  it('drops unknown or out-of-range optional fields (iOS reports -1)', () => {
    expect(toTrackPoint(fix({ speed: -1, heading: -1, accuracy: null }), config)).toMatchObject({
      accuracyM: null,
      speedMps: null,
      headingDeg: null,
    });
    expect(toTrackPoint(fix({ heading: 360, speed: 150 }), config)).toMatchObject({
      headingDeg: null,
      speedMps: null,
    });
  });

  it('rejects invalid coordinates, times and imprecise fixes', () => {
    expect(toTrackPoint(fix({ latitude: 91 }), config)).toBeNull();
    expect(toTrackPoint(fix({ longitude: Number.NaN }), config)).toBeNull();
    expect(toTrackPoint(fix({}, Number.NaN), config)).toBeNull();
    expect(toTrackPoint(fix({}, 0), config)).toBeNull();
    expect(toTrackPoint(fix({ accuracy: 1500 }), config)).toBeNull();
  });
});

describe('thinPoints', () => {
  it('keeps a point every ~60 s while parked', () => {
    const points = [0, 20, 40, 60, 90, 125].map((s) => point(s));
    expect(thinPoints(null, points, config).map((p) => p.recordedAt)).toEqual([
      point(0).recordedAt,
      point(60).recordedAt,
      point(125).recordedAt,
    ]);
  });

  it('keeps a point every ~500 m on the highway', () => {
    // ~0.0045° of latitude is ~500 m.
    const points = [point(0, 25.7), point(10, 25.7025), point(20, 25.705), point(30, 25.7075)];
    expect(thinPoints(null, points, config).map((p) => p.lat)).toEqual([25.7, 25.705]);
  });

  it('continues from the last kept point, sorted, without repeats', () => {
    const kept = thinPoints(point(0), [point(120), point(0), point(-30), point(60)], config);
    expect(kept.map((p) => p.recordedAt)).toEqual([point(60).recordedAt, point(120).recordedAt]);
  });
});

describe('shouldFlush', () => {
  const now = new Date(T0 + 10 * 60_000);

  it('waits to send in batches', () => {
    expect(shouldFlush({ count: 0, oldestAt: null }, now, config)).toBe(false);
    expect(shouldFlush({ count: 3, oldestAt: point(9 * 60).recordedAt }, now, config)).toBe(false);
  });

  it('sends when the queue is full enough or its oldest point is old', () => {
    expect(shouldFlush({ count: 30, oldestAt: point(9 * 60).recordedAt }, now, config)).toBe(true);
    expect(shouldFlush({ count: 1, oldestAt: point(5 * 60).recordedAt }, now, config)).toBe(true);
  });
});

describe('trackingDecision', () => {
  const ready = { consented: true, backgroundPermission: true };

  it('tracks only in active trip statuses and stops on delivery', () => {
    for (const status of TRIP_STATUSES) {
      const expected = (ACTIVE_TRIP_STATUSES as readonly string[]).includes(status)
        ? 'track'
        : 'stop';
      expect(trackingDecision({ status, ...ready })).toBe(expected);
    }
    expect(trackingDecision({ status: 'delivered', ...ready })).toBe('stop');
    expect(trackingDecision({ status: 'assigned', ...ready })).toBe('stop');
    expect(trackingDecision({ status: null, ...ready })).toBe('stop');
  });

  it('needs the consent first, then the permission', () => {
    expect(
      trackingDecision({ status: 'in_transit', consented: false, backgroundPermission: false }),
    ).toBe('needs_consent');
    expect(
      trackingDecision({ status: 'in_transit', consented: true, backgroundPermission: false }),
    ).toBe('needs_permission');
  });
});

describe('locationAdvice (D17)', () => {
  const precise = { foreground: true, background: true, accuracy: 'precise' } as const;

  it('is ok only with the precise location and "Always"', () => {
    expect(locationAdvice(precise)).toBe('ok');
    // The OS does not report the precision (iOS before 14): not approximate.
    expect(locationAdvice({ ...precise, accuracy: null })).toBe('ok');
  });

  it('asks for the location first, then "Always", then the precise location', () => {
    expect(locationAdvice({ foreground: false, background: false, accuracy: null })).toBe('denied');
    expect(locationAdvice({ ...precise, foreground: false })).toBe('denied');
    expect(locationAdvice({ ...precise, background: false })).toBe('enable_always');
    expect(locationAdvice({ ...precise, background: false, accuracy: 'approximate' })).toBe(
      'enable_always',
    );
    expect(locationAdvice({ ...precise, accuracy: 'approximate' })).toBe('enable_precise');
  });

  it('has a reason for every advice but ok', () => {
    for (const advice of ['denied', 'enable_always', 'enable_precise'] as const) {
      expect(trackingCopy.preciseMissing[advice]).toBeTruthy();
    }
    expect(trackingCopy.preciseBody).toContain('precisa');
    expect(trackingCopy.preciseBody).toContain('Siempre');
  });
});

describe('consent text', () => {
  it('has a dated version the database accepts', () => {
    expect(LOCATION_CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });

  it('explains when, who and how to withdraw', () => {
    const text = [...locationConsentCopy.points, locationConsentCopy.legal].join(' ');
    for (const expected of [
      'viaje activo',
      'entrega',
      'segundo plano',
      'retirar',
      'Datos Personales',
    ]) {
      expect(text.toLowerCase()).toContain(expected.toLowerCase());
    }
  });
});
