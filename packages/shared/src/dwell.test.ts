import { describe, expect, it } from 'vitest';

import { dwellCopy, formatDwell, formatDwellDuration } from './copy/dwell';
import {
  DEFAULT_DWELL_MINUTES,
  defaultDwellEstimate,
  dwellEstimate,
  estimatedStopEnd,
  hourBand,
  isValidSample,
  median,
  parseDwellEstimate,
  parseTripEndEstimate,
  percentile,
  returnTripDwells,
  suggestedHandlingMinutes,
  type DwellEstimate,
  type DwellSample,
} from './dwell';

const GDL = { lat: 20.6597, lng: -103.3496 };
const OTHER = { lat: 20.68, lng: -103.43 };
const NOW = new Date('2026-10-20T16:00:00Z'); // 10:00 in Mexico City: morning
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const sample = (over: Partial<DwellSample> = {}): DwellSample => ({
  site: GDL,
  shipperCompanyId: 'S',
  carrierCompanyId: 'A',
  arrivedAt: NOW,
  waitMinutes: 120,
  handlingMinutes: 60,
  ...over,
});

// The fixture of 46_site_dwell: carrier A unloads 5 times at this hour of
// past days and once 12 h off.
const fixture: DwellSample[] = [
  ...[1, 2, 3, 4, 5].map((n) => sample({ arrivedAt: new Date(NOW.getTime() - (n + 1) * DAY) })),
  sample({ arrivedAt: new Date(NOW.getTime() - 7 * DAY - 12 * HOUR) }),
];

const carrier = (companyId: string) => ({ kind: 'carrier' as const, companyId });
const shipper = (companyId: string) => ({ kind: 'shipper' as const, companyId });
const query = (over: Partial<Parameters<typeof dwellEstimate>[1]> = {}) => ({
  stop: 'delivery' as const,
  site: GDL,
  at: NOW,
  viewer: carrier('A'),
  ...over,
});
const summary = (e: DwellEstimate) => [e.basis, e.sampleSize, e.totalMedianMinutes];

describe('hourBand (Mexico City)', () => {
  it('splits the day in four bands by the local hour', () => {
    expect(hourBand(new Date('2026-10-20T06:00:00Z'))).toBe('night'); // 00:00
    expect(hourBand(new Date('2026-10-20T11:59:00Z'))).toBe('night'); // 05:59
    expect(hourBand(new Date('2026-10-20T12:00:00Z'))).toBe('morning'); // 06:00
    expect(hourBand(new Date('2026-10-20T18:00:00Z'))).toBe('afternoon'); // 12:00
    expect(hourBand(new Date('2026-10-21T00:00:00Z'))).toBe('evening'); // 18:00
    expect(hourBand(new Date('2026-10-21T05:59:00Z'))).toBe('evening'); // 23:59
  });
});

describe('median and percentile', () => {
  it('interpolate like percentile_cont', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(percentile([0, 10, 20, 30, 40], 0.75)).toBe(30);
    expect(percentile([0, 10], 0.75)).toBe(7.5);
    expect(median([])).toBeNull();
  });
});

describe('dwellEstimate', () => {
  it('uses the same site and hour band first, from 5 measurements', () => {
    expect(summary(dwellEstimate(fixture, query()))).toEqual(['site_hour', 5, 180]);
  });

  it('falls back to the whole site in another band, or without an hour', () => {
    expect(
      summary(dwellEstimate(fixture, query({ at: new Date(NOW.getTime() + 12 * HOUR) }))),
    ).toEqual(['site', 6, 180]);
    expect(summary(dwellEstimate(fixture, query({ at: null })))).toEqual(['site', 6, 180]);
  });

  it('falls back to the shipper’s sites, then to the default', () => {
    expect(summary(dwellEstimate(fixture, query({ site: OTHER, shipperCompanyId: 'S' })))).toEqual([
      'shipper',
      6,
      180,
    ]);
    const fallback = dwellEstimate(fixture, query({ site: OTHER }));
    expect(fallback).toEqual(defaultDwellEstimate('delivery'));
    expect(fallback.totalMedianMinutes).toBe(DEFAULT_DWELL_MINUTES.delivery);
  });

  it('gives waiting and handling separately', () => {
    const e = dwellEstimate(fixture, query());
    expect([e.waitMedianMinutes, e.handlingMedianMinutes]).toEqual([120, 60]);
  });

  it('counts a site 100 m away as the same site (3 decimals)', () => {
    const near = { lat: 20.65974, lng: -103.34964 };
    expect(summary(dwellEstimate(fixture, query({ site: near })))).toEqual(['site_hour', 5, 180]);
  });

  it('ignores outliers: negative times, more than 72 h, or not finished', () => {
    const outliers = [
      sample({ waitMinutes: -30 }),
      sample({ waitMinutes: 73 * 60 }),
      sample({ handlingMinutes: null }),
    ];
    expect(outliers.some(isValidSample)).toBe(false);
    const fewer = [...fixture.slice(0, 4), ...outliers];
    expect(dwellEstimate(fewer, query()).basis).toBe('default');
  });

  it('shows other carriers’ trips only from 2 carriers up', () => {
    expect(dwellEstimate(fixture, query({ viewer: carrier('B') })).basis).toBe('default');
    const withB = [
      ...fixture,
      sample({ carrierCompanyId: 'B', arrivedAt: new Date(NOW.getTime() - 9 * DAY) }),
    ];
    expect(summary(dwellEstimate(withB, query({ viewer: carrier('C') })))).toEqual([
      'site_hour',
      6,
      180,
    ]);
  });

  it('shows a shipper only its own trips, and an admin every trip', () => {
    expect(summary(dwellEstimate(fixture, query({ viewer: shipper('S') })))).toEqual([
      'site_hour',
      5,
      180,
    ]);
    expect(dwellEstimate(fixture, query({ viewer: shipper('S2') })).basis).toBe('default');
    expect(dwellEstimate(fixture, query({ viewer: { kind: 'admin' } })).sampleSize).toBe(5);
  });
});

describe('estimatedStopEnd', () => {
  const measured = dwellEstimate(fixture, query());
  it('adds the whole time at the site to the arrival', () => {
    expect(estimatedStopEnd({ arrivedAt: NOW, estimate: measured })).toEqual(
      new Date(NOW.getTime() + 3 * HOUR),
    );
  });
  it('adds only the handling once it started (the default 4 h without measurements)', () => {
    const started = new Date(NOW.getTime() + HOUR);
    expect(
      estimatedStopEnd({ arrivedAt: NOW, handlingStartedAt: started, estimate: measured }),
    ).toEqual(new Date(started.getTime() + HOUR));
    expect(
      estimatedStopEnd({
        arrivedAt: NOW,
        handlingStartedAt: started,
        estimate: defaultDwellEstimate('delivery'),
      }),
    ).toEqual(new Date(started.getTime() + 4 * HOUR));
  });
});

describe('suggestedHandlingMinutes', () => {
  it('suggests the measured unloading, or 4 h without measurements', () => {
    expect(suggestedHandlingMinutes(dwellEstimate(fixture, query()))).toBe(60);
    expect(suggestedHandlingMinutes(defaultDwellEstimate('delivery'))).toBe(240);
    expect(suggestedHandlingMinutes(null)).toBe(240);
    const instant = { ...dwellEstimate(fixture, query()), handlingMedianMinutes: 0 };
    expect(suggestedHandlingMinutes(instant)).toBe(15);
  });
});

describe('parsing the RPC answers', () => {
  it('reads the row of site_dwell_estimate', () => {
    expect(
      parseDwellEstimate([
        {
          basis: 'site',
          sample_size: 6,
          wait_median_minutes: 120,
          wait_p75_minutes: 150,
          handling_median_minutes: 60,
          handling_p75_minutes: 90,
          total_median_minutes: 180,
          total_p75_minutes: 210,
        },
      ]),
    ).toEqual({
      basis: 'site',
      sampleSize: 6,
      waitMedianMinutes: 120,
      waitP75Minutes: 150,
      handlingMedianMinutes: 60,
      handlingP75Minutes: 90,
      totalMedianMinutes: 180,
      totalP75Minutes: 210,
    });
    expect(parseDwellEstimate([])).toBeNull();
    expect(
      parseDwellEstimate([{ basis: 'nope', sample_size: 1, total_median_minutes: 1 }]),
    ).toBeNull();
  });

  it('reads the row of trip_estimated_end', () => {
    expect(
      parseTripEndEstimate([
        {
          ends_at: '2026-10-22T18:30:00+00:00',
          source: 'measured',
          basis: 'site',
          sample_size: 12,
        },
      ]),
    ).toEqual({
      endsAt: '2026-10-22T18:30:00+00:00',
      source: 'measured',
      basis: 'site',
      sampleSize: 12,
    });
    expect(parseTripEndEstimate([])).toBeNull();
    expect(parseTripEndEstimate([{ ends_at: 'x', source: 'measured' }])).toBeNull();
  });
});

describe('returnTripDwells', () => {
  it('asks once per site and leaves out the sites that fail', async () => {
    const asked: string[] = [];
    const estimate = async (site: { lat: number; lng: number }) => {
      asked.push(`${site.lat}`);
      if (site.lat === OTHER.lat) throw new Error('down');
      return defaultDwellEstimate('delivery');
    };
    const result = await returnTripDwells([GDL, null, { ...GDL }, OTHER], estimate);
    expect(asked).toHaveLength(2);
    expect(result.map((r) => r?.basis)).toEqual(['default', undefined, 'default', undefined]);
  });
});

describe('copy', () => {
  it('formats durations', () => {
    expect(formatDwellDuration(42)).toBe('~40 min');
    expect(formatDwellDuration(1)).toBe('~5 min');
    expect(formatDwellDuration(180)).toBe('~3 h');
    expect(formatDwellDuration(150)).toBe('~2 h 30 min');
    expect(formatDwellDuration(359)).toBe('~6 h');
  });

  it('says how many trips an estimate comes from, or that it is the default', () => {
    const measured = dwellEstimate(fixture, query({ at: null }));
    expect(formatDwell(measured)).toBe('~3 h (6 viajes)');
    expect(formatDwell(defaultDwellEstimate('delivery'))).toBe('~4 h (valor por defecto)');
    expect(dwellCopy.returnTrip(measured)).toBe('Espera típica en descarga: ~3 h (6 viajes)');
    expect(dwellCopy.pickup(measured)).toBe('Espera típica al cargar: ~3 h (6 viajes)');
  });

  it('explains the estimated end of unloading', () => {
    const base = { endsAt: '2026-10-22T18:30:00Z', basis: null, sampleSize: null };
    expect(dwellCopy.tripEndBasis({ ...base, source: 'finished' })).toBeNull();
    expect(dwellCopy.tripEndBasis({ ...base, source: 'operator' })).toBe('Estimado del operador');
    expect(dwellCopy.tripEndBasis({ ...base, source: 'default' })).toMatch(/por defecto/);
    expect(
      dwellCopy.tripEndBasis({ ...base, source: 'measured', basis: 'site', sampleSize: 12 }),
    ).toBe('Según 12 viajes en este sitio');
    expect(
      dwellCopy.tripEndBasis({ ...base, source: 'measured', basis: 'site_hour', sampleSize: 1 }),
    ).toBe('Según 1 viaje en este sitio a esta hora');
  });
});
