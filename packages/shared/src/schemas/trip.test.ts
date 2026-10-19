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
  tripDocumentSchema,
} from './trip';
import { TRIP_DOCUMENT_KINDS } from '../enums';

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

  it('reports invalid readings in Spanish', () => {
    for (const reading of [
      { accuracyM: -1 },
      { accuracyM: 'x' },
      { speedMps: 101 },
      { headingDeg: 360 },
    ]) {
      expect(
        locationPointSchema.safeParse({ ...POINT, ...reading }).error?.issues[0]?.message,
      ).toBe(m.coordinates);
    }
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

describe('trip document', () => {
  const DOC = {
    tripId: '5eed0008-0000-4000-8000-000000000002',
    kind: TRIP_DOCUMENT_KINDS[0],
    storagePath: 'trips/5eed0008-0000-4000-8000-000000000002/carta-porte.pdf',
    fileName: ' carta-porte.pdf ',
  };

  it('accepts a registered upload and trims the file name', () => {
    expect(tripDocumentSchema.parse(DOC)).toEqual({ ...DOC, fileName: 'carta-porte.pdf' });
  });

  it('refuses an invalid trip id or document kind', () => {
    expect(tripDocumentSchema.safeParse({ ...DOC, tripId: 'abc' }).success).toBe(false);
    expect(tripDocumentSchema.safeParse({ ...DOC, kind: 'selfie' }).success).toBe(false);
  });

  it('needs a path and a file name within their limits', () => {
    expect(
      tripDocumentSchema.safeParse({ ...DOC, storagePath: '' }).error?.issues[0]?.message,
    ).toBe(m.required);
    expect(tripDocumentSchema.safeParse({ ...DOC, storagePath: 'x'.repeat(301) }).success).toBe(
      false,
    );
    expect(tripDocumentSchema.safeParse({ ...DOC, storagePath: 'x'.repeat(300) }).success).toBe(
      true,
    );
    expect(tripDocumentSchema.safeParse({ ...DOC, fileName: '  ' }).error?.issues[0]?.message).toBe(
      m.required,
    );
    expect(
      tripDocumentSchema.safeParse({ ...DOC, fileName: 'x'.repeat(256) }).error?.issues[0]?.message,
    ).toBe(m.tooLong(255));
  });
});
