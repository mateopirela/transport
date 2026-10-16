import { describe, expect, expectTypeOf, it } from 'vitest';

import { operatorEvidenceCopy } from './copy/trips';
import type { Database, Tables } from './db';
import { TRIP_STATUSES } from './enums';
import {
  captureStageForStatus,
  DEFAULT_EVIDENCE_MINIMUMS,
  evidenceMinimumsFrom,
  evidenceStageForEvent,
  evidenceStoragePath,
  missingPhotos,
  toHex,
} from './evidence';
import { receiverFormSchema } from './schemas/trip';
import { OPERATOR_TRIP_STEPS } from './trips';

const TRIP = '7f1c2a8e-4b6d-4c3e-9a1f-2d5e6f708192';

describe('evidence gate (mirrors record_trip_event)', () => {
  it('gates leaving the pickup and finishing the delivery, and nothing else', () => {
    const gated = OPERATOR_TRIP_STEPS.filter((event) => evidenceStageForEvent(event) !== null);
    expect(gated).toEqual(['loading_finished', 'unloading_finished']);
    expect(evidenceStageForEvent('loading_finished')).toBe('pickup');
    expect(evidenceStageForEvent('unloading_finished')).toBe('delivery');
  });

  it('photographs the stage the gated step needs, at the statuses before it', () => {
    expect(captureStageForStatus('loading')).toBe(evidenceStageForEvent('loading_finished'));
    expect(captureStageForStatus('unloading')).toBe(evidenceStageForEvent('unloading_finished'));
    expect(captureStageForStatus('at_pickup')).toBe('pickup');
    expect(captureStageForStatus('at_delivery')).toBe('delivery');
    expect(captureStageForStatus('delivered')).toBe('delivery');
    for (const status of [
      'assigned',
      'en_route_to_pickup',
      'in_transit',
      'closed',
      'cancelled',
    ] as const) {
      expect(captureStageForStatus(status)).toBeNull();
    }
    for (const status of TRIP_STATUSES) expect(() => captureStageForStatus(status)).not.toThrow();
  });

  it('counts the missing photos without going negative', () => {
    expect(missingPhotos(2, 0)).toBe(2);
    expect(missingPhotos(2, 1)).toBe(1);
    expect(missingPhotos(2, 5)).toBe(0);
    expect(missingPhotos(0, 0)).toBe(0);
  });

  it('reads the minimums from trip_evidence_requirements rows, keeping defaults for missing ones', () => {
    expect(evidenceMinimumsFrom([])).toEqual(DEFAULT_EVIDENCE_MINIMUMS);
    expect(evidenceMinimumsFrom([{ stage: 'delivery', min_photos: 4 }])).toEqual({
      pickup: DEFAULT_EVIDENCE_MINIMUMS.pickup,
      delivery: 4,
    });
    expect(
      evidenceMinimumsFrom([
        { stage: 'pickup', min_photos: 0 },
        { stage: 'incident', min_photos: 9 },
      ]),
    ).toEqual({ pickup: 0, delivery: DEFAULT_EVIDENCE_MINIMUMS.delivery });
  });
});

describe('evidence files', () => {
  it('builds the {trip}/{stage}/{uuid}.jpg path the bucket policy accepts', () => {
    const path = evidenceStoragePath({
      tripId: TRIP,
      stage: 'delivery',
      fileId: 'B6000000-0000-4000-8000-000000000001',
    });
    expect(path).toBe(`${TRIP}/delivery/b6000000-0000-4000-8000-000000000001.jpg`);
    // Same pattern as evidence_bucket_insert_assigned_operator.
    expect(path).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(pickup|delivery|incident)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|heic)$/u,
    );
  });

  it('encodes a digest as the 64-character hex that trip_evidence.sha256 requires', () => {
    expect(toHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
    const digest = new Uint8Array(32).fill(171).buffer;
    expect(toHex(digest)).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe('receiver at delivery', () => {
  it('requires a trimmed name of at most 200 characters', () => {
    expect(receiverFormSchema.parse({ receivedBy: '  Rosa Almacén ' })).toEqual({
      receivedBy: 'Rosa Almacén',
    });
    expect(receiverFormSchema.safeParse({ receivedBy: '   ' }).success).toBe(false);
    expect(receiverFormSchema.safeParse({ receivedBy: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('evidence copy', () => {
  it('speaks of the missing photos in singular and plural', () => {
    expect(operatorEvidenceCopy.missing('pickup', 1)).toContain('1 foto más');
    expect(operatorEvidenceCopy.missing('delivery', 2)).toContain('2 fotos más');
    expect(operatorEvidenceCopy.progress(1, 2)).toBe('1 de 2 fotos mínimas');
    expect(operatorEvidenceCopy.progress(1, 0)).toBe('1 foto (sin mínimo)');
  });
});

describe('generated database types (B23)', () => {
  it('types the minimums, the receiver and the new RPC argument', () => {
    expectTypeOf<Tables<'trip_evidence_requirements'>['min_photos']>().toEqualTypeOf<number>();
    expectTypeOf<Tables<'trip_events'>['received_by_name']>().toEqualTypeOf<string | null>();
    expectTypeOf<
      Database['public']['Functions']['record_trip_event']['Args']['p_received_by_name']
    >().toEqualTypeOf<string | undefined>();
  });
});
