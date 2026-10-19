import { describe, expect, it } from 'vitest';

import {
  groupTripChecklist,
  isTripDocumentCode,
  missingTripDocumentsFromError,
  tripChecklistPending,
  uploadableTripDocumentKinds,
  type TripChecklistRow,
  type TripDocumentRequirement,
} from './trip-checklist';
import { TRIP_DOCUMENT_KINDS } from './enums';

const row = (over: Partial<TripChecklistRow>): TripChecklistRow => ({
  code: 'carta_porte',
  stage: 'before_departure',
  responsible: 'carrier',
  required: true,
  done_at: null,
  ...over,
});

const CHECKLIST: TripChecklistRow[] = [
  row({ code: 'invoice', stage: 'billing' }),
  row({ code: 'delivery_receipt', stage: 'delivery', responsible: 'operator' }),
  row({ code: 'service_order', responsible: 'shipper', done_at: '2026-10-16T10:00:00Z' }),
  row({ code: 'other', required: false }),
  row({ code: 'pickup_evidence', stage: 'pickup', responsible: 'operator' }),
  row({ code: 'carta_porte' }),
  row({ code: 'later', stage: 'archive' }),
];

describe('groupTripChecklist', () => {
  it('groups by stage in the order of the trip, unknown stages last, keeping row order', () => {
    const groups = groupTripChecklist(CHECKLIST);
    expect(groups.map((g) => g.stage)).toEqual([
      'before_departure',
      'pickup',
      'delivery',
      'billing',
      'archive',
    ]);
    expect(groups[0]?.rows.map((r) => r.code)).toEqual(['service_order', 'other', 'carta_porte']);
  });

  it('counts only the required rows still pending', () => {
    const groups = groupTripChecklist(CHECKLIST);
    expect(groups.map((g) => [g.stage, g.pending])).toEqual([
      ['before_departure', 1],
      ['pickup', 1],
      ['delivery', 1],
      ['billing', 1],
      ['archive', 1],
    ]);
    expect(tripChecklistPending(CHECKLIST)).toBe(5);
    expect(groupTripChecklist([])).toEqual([]);
  });
});

describe('uploadableTripDocumentKinds', () => {
  const requirements: TripDocumentRequirement[] = [
    { kind: 'other', uploader_sides: ['shipper', 'carrier'], sort_order: 40 },
    { kind: 'invoice', uploader_sides: ['carrier'], sort_order: 30 },
    { kind: 'carta_porte', uploader_sides: ['carrier'], sort_order: 20 },
    { kind: 'service_order', uploader_sides: ['shipper', 'carrier'], sort_order: 10 },
  ];

  it('mirrors add_trip_document: each side gets its kinds, in catalog order', () => {
    expect(uploadableTripDocumentKinds(requirements, 'shipper')).toEqual([
      'service_order',
      'other',
    ]);
    expect(uploadableTripDocumentKinds(requirements, 'carrier')).toEqual([
      'service_order',
      'carta_porte',
      'invoice',
      'other',
    ]);
  });

  it('tells document codes from evidence codes', () => {
    expect(isTripDocumentCode('carta_porte', TRIP_DOCUMENT_KINDS)).toBe(true);
    expect(isTripDocumentCode('pickup_evidence', TRIP_DOCUMENT_KINDS)).toBe(false);
  });

  it('reads the kinds a refused departure names (record_trip_event, blocks_departure)', () => {
    expect(
      missingTripDocumentsFromError('trip documents are missing: service_order, carta_porte'),
    ).toEqual(['service_order', 'carta_porte']);
    expect(missingTripDocumentsFromError('trip documents are missing: unknown, invoice')).toEqual([
      'invoice',
    ]);
    expect(missingTripDocumentsFromError('cannot record departed on a trip in status')).toBeNull();
    expect(missingTripDocumentsFromError('')).toBeNull();
  });
});
