import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ROAD_DISTANCE_FACTOR,
  estimateRoadKm,
  haversineKm,
  roadDistanceFactor,
} from './geo';

const mty = { lat: 25.6866, lng: -100.3161 };
const gdl = { lat: 20.6597, lng: -103.3496 };

describe('haversineKm', () => {
  it('measures Monterrey → Guadalajara (~640 km in a straight line)', () => {
    expect(haversineKm(mty, gdl)).toBeGreaterThan(625);
    expect(haversineKm(mty, gdl)).toBeLessThan(655);
  });

  it('is zero for the same point and symmetric', () => {
    expect(haversineKm(mty, mty)).toBe(0);
    expect(haversineKm(mty, gdl)).toBeCloseTo(haversineKm(gdl, mty), 9);
  });

  it('rejects invalid coordinates', () => {
    expect(() => haversineKm({ lat: Number.NaN, lng: 0 }, mty)).toThrow(RangeError);
    expect(() => haversineKm({ lat: 95, lng: 0 }, mty)).toThrow(RangeError);
  });
});

describe('estimateRoadKm', () => {
  it('applies the road factor (MTY → GDL is ~800-900 km by road)', () => {
    const km = estimateRoadKm(mty, gdl);
    expect(km).toBeCloseTo(haversineKm(mty, gdl) * DEFAULT_ROAD_DISTANCE_FACTOR, 9);
    expect(km).toBeGreaterThan(800);
    expect(km).toBeLessThan(900);
  });

  it('accepts a custom factor', () => {
    expect(estimateRoadKm(mty, gdl, 1)).toBeCloseTo(haversineKm(mty, gdl), 9);
  });
});

describe('roadDistanceFactor', () => {
  it('parses valid values and falls back otherwise', () => {
    expect(roadDistanceFactor('1.25')).toBe(1.25);
    for (const bad of [undefined, '', 'abc', '0.5', '10']) {
      expect(roadDistanceFactor(bad)).toBe(DEFAULT_ROAD_DISTANCE_FACTOR);
    }
  });
});
