import { describe, expect, it } from 'vitest';

import { adminOpsCopy } from './copy/admin-ops';
import { formatLongDuration, pilotKpiTiles, type PilotKpiSummary } from './kpis';

const empty: PilotKpiSummary = {
  loads_published: 0,
  offers_total: 0,
  trips_total: 0,
  trips_closed: 0,
  return_trips: 0,
  avg_empty_km: null,
  total_avoided_empty_km: 0,
  avg_avoided_empty_km: null,
  median_minutes_to_first_offer: null,
  median_minutes_to_contract: null,
  median_minutes_to_carrier_approval: null,
  avg_abs_unload_error_minutes: null,
  unload_estimates_measured: 0,
};

const byKey = (summary: PilotKpiSummary, factor?: number) =>
  Object.fromEntries(pilotKpiTiles(summary, factor).map((tile) => [tile.key, tile]));

describe('formatLongDuration', () => {
  it('keeps hours and minutes under a day', () => {
    expect(formatLongDuration(45)).toBe('45 min');
    expect(formatLongDuration(135)).toBe('2 h 15 min');
  });

  it('switches to days and hours from 24 hours', () => {
    expect(formatLongDuration(24 * 60)).toBe('1 d');
    expect(formatLongDuration(2880 + 4 * 60 + 10)).toBe('2 d 4 h');
  });

  it('throws on negative or non-finite values', () => {
    expect(() => formatLongDuration(-1)).toThrow(RangeError);
    expect(() => formatLongDuration(Number.NaN)).toThrow(RangeError);
  });
});

describe('pilotKpiTiles', () => {
  it('shows every indicator of producto §5, with "Sin datos" when nothing was measured', () => {
    const tiles = byKey(empty);
    expect(Object.keys(tiles)).toEqual([
      'loads',
      'offers',
      'trips',
      'returnTrips',
      'emptyKm',
      'avoidedKm',
      'firstOffer',
      'contract',
      'onboarding',
      'unloadAccuracy',
    ]);
    expect(tiles.emptyKm?.value).toBe(adminOpsCopy.kpis.noData);
    expect(tiles.firstOffer?.value).toBe(adminOpsCopy.kpis.noData);
    expect(tiles.avoidedKm?.value).toBe('0 km');
    expect(tiles.avoidedKm?.hint).toBeUndefined();
    expect(tiles.returnTrips?.hint).toBe('Meta: los primeros 5');
  });

  it('turns straight-line km into road estimates with the road factor', () => {
    const tiles = byKey(
      { ...empty, avg_empty_km: 10, total_avoided_empty_km: 640, avg_avoided_empty_km: 640 },
      1.5,
    );
    expect(tiles.emptyKm?.value).toBe('15 km');
    expect(tiles.avoidedKm?.value).toBe('960 km');
    expect(tiles.avoidedKm?.hint).toBe('960 km por viaje');
  });

  it('formats counts and medians', () => {
    const tiles = byKey({
      ...empty,
      loads_published: 1234,
      trips_total: 7,
      trips_closed: 2,
      median_minutes_to_first_offer: 95,
      median_minutes_to_carrier_approval: 2880,
      avg_abs_unload_error_minutes: 30,
      unload_estimates_measured: 1,
    });
    expect(tiles.loads?.value).toBe('1,234');
    expect(tiles.trips?.hint).toBe('2 cerrados');
    expect(tiles.firstOffer?.value).toBe('1 h 35 min');
    expect(tiles.onboarding?.value).toBe('2 d');
    expect(tiles.unloadAccuracy?.value).toBe('30 min');
    expect(tiles.unloadAccuracy?.hint).toBe('1 descarga medida');
  });

  it('treats null counts as zero', () => {
    const tiles = byKey({ ...empty, loads_published: null, trips_closed: null });
    expect(tiles.loads?.value).toBe('0');
    expect(tiles.trips?.hint).toBe('0 cerrados');
  });
});
