import { describe, expect, it } from 'vitest';

import { validationMessages as m } from '../copy/validation';
import {
  cancelTripSchema,
  evidenceMetadataSchema,
  incidentFormSchema,
  incidentResolutionSchema,
  locationBatchSchema,
  locationPointSchema,
  optionalCoordinatesSchema,
} from './trip';

const POINT = { recordedAt: '2026-11-02T10:00:00-06:00', lat: 25.67, lng: -100.31 };
const HASH = 'ab'.repeat(32);

describe('location points', () => {
  it('accepts a point with optional readings', () => {
    const point = { ...POINT, accuracyM: 8, speedMps: 25, headingDeg: 359.9 };
    expect(locationPointSchema.parse(point)).toEqual(point);
  });

  it('rejects invalid coordinates and timestamps', () => {
    expect(locationPointSchema.safeParse({ ...POINT, lat: 95 }).success).toBe(false);
    expect(locationPointSchema.safeParse({ ...POINT, lng: -181 }).success).toBe(false);
    expect(locationPointSchema.safeParse({ ...POINT, recordedAt: 'ayer' }).success).toBe(false);
    expect(locationPointSchema.safeParse({ ...POINT, headingDeg: 360 }).success).toBe(false);
    expect(locationPointSchema.safeParse(null).error?.issues[0]?.message).toBe(m.coordinates);
  });

  it('limits a batch to 500 points', () => {
    expect(locationBatchSchema.safeParse(Array.from({ length: 500 }, () => POINT)).success).toBe(
      true,
    );
    const tooMany = locationBatchSchema.safeParse(Array.from({ length: 501 }, () => POINT));
    expect(tooMany.error?.issues[0]?.message).toBe(m.tooManyItems(500));
  });
});

describe('optional coordinates', () => {
  it('takes both coordinates or none', () => {
    expect(optionalCoordinatesSchema.safeParse({}).success).toBe(true);
    expect(optionalCoordinatesSchema.safeParse({ lat: 20.6, lng: -103.3 }).success).toBe(true);
    expect(optionalCoordinatesSchema.safeParse({ lat: 20.6 }).error?.issues[0]?.message).toBe(
      m.coordinates,
    );
  });
});

describe('incident and cancellation forms', () => {
  it('needs a kind and a description', () => {
    expect(incidentFormSchema.parse({ kind: 'delay', description: '  Tráfico  ' })).toEqual({
      kind: 'delay',
      description: 'Tráfico',
    });
    expect(incidentFormSchema.safeParse({ kind: 'alien', description: 'x' }).success).toBe(false);
    expect(incidentFormSchema.safeParse({ kind: 'delay', description: ' ' }).success).toBe(false);
  });

  it('needs a reason to resolve an incident or cancel a trip', () => {
    expect(incidentResolutionSchema.safeParse({ resolution: 'Listo' }).success).toBe(true);
    expect(cancelTripSchema.safeParse({ reason: '' }).error?.issues[0]?.message).toBe(m.required);
    expect(cancelTripSchema.safeParse({ reason: 'x'.repeat(1001) }).success).toBe(false);
  });
});

describe('evidence metadata', () => {
  it('accepts a photo with a SHA-256 hash', () => {
    const value = { stage: 'delivery', sha256: HASH, capturedAt: '2026-11-03T10:00:00-06:00' };
    expect(evidenceMetadataSchema.parse(value)).toEqual(value);
  });

  it('rejects malformed hashes', () => {
    const result = evidenceMetadataSchema.safeParse({
      stage: 'pickup',
      sha256: 'AB'.repeat(32),
      capturedAt: '2026-11-03T10:00:00-06:00',
    });
    expect(result.error?.issues[0]?.message).toBe(m.fileHash);
  });

  it('links incident photos, and only them, to their incident', () => {
    const base = { sha256: HASH, capturedAt: '2026-11-03T10:00:00-06:00' };
    const incidentId = '7d3c8a5e-1b2f-4c3d-9e8f-0a1b2c3d4e5f';
    expect(
      evidenceMetadataSchema.safeParse({ ...base, stage: 'incident', incidentId }).success,
    ).toBe(true);
    expect(evidenceMetadataSchema.safeParse({ ...base, stage: 'incident' }).success).toBe(false);
    expect(evidenceMetadataSchema.safeParse({ ...base, stage: 'pickup', incidentId }).success).toBe(
      false,
    );
  });
});
