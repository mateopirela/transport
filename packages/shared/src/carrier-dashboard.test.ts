import { describe, expect, it } from 'vitest';

import {
  carrierNegotiationTone,
  EXPIRY_WINDOW_DAYS,
  expiringDocuments,
  firstOf,
  type FleetOwner,
} from './carrier-dashboard';
import type { Requirement, SubmittedDocument } from './verification';

// 12:00 in Mexico City.
const NOW = new Date('2026-11-11T18:00:00Z');

function requirement(id: string, name: string): Requirement {
  return {
    id,
    code: id,
    name,
    description: null,
    owner_type: 'vehicle',
    company_type: null,
    taxpayer_type: null,
    is_required: true,
    optional_for: [],
    requires_expiry: true,
    sort_order: 0,
    archived_at: null,
  };
}

function document(
  overrides: Partial<SubmittedDocument> & Pick<SubmittedDocument, 'id'>,
): SubmittedDocument {
  return {
    requirement_id: 'policy',
    owner_type: 'vehicle',
    owner_id: 'v1',
    status: 'approved',
    review_notes: null,
    expires_at: '2026-11-20T06:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    file_name: 'poliza.pdf',
    ...overrides,
  };
}

const requirements = [requirement('policy', 'Póliza'), requirement('card', 'Tarjeta')];
const truck: FleetOwner = { type: 'vehicle', id: 'v1', label: 'CS53-01' };
const driver: FleetOwner = { type: 'operator', id: 'o1', label: 'Pedro López' };

describe('expiringDocuments', () => {
  it('lists the approved documents that expire within the window, soonest first', () => {
    const found = expiringDocuments(
      {
        requirements,
        documents: [
          document({ id: 'late', requirement_id: 'card', expires_at: '2026-12-01T06:00:00Z' }),
          document({ id: 'soon' }),
        ],
      },
      [truck],
      NOW,
    );
    expect(found.map((d) => d.documentId)).toEqual(['soon', 'late']);
    expect(found[0]).toMatchObject({ requirementName: 'Póliza', owner: truck, daysLeft: 9 });
  });

  it('counts calendar days in Mexico City: tonight is today, tomorrow morning is one', () => {
    const found = expiringDocuments(
      {
        requirements,
        documents: [
          // 23:00 in Mexico City, same day.
          document({ id: 'tonight', expires_at: '2026-11-12T05:00:00Z' }),
          document({
            id: 'tomorrow',
            requirement_id: 'card',
            expires_at: '2026-11-12T15:00:00Z',
          }),
        ],
      },
      [truck],
      NOW,
    );
    expect(found.map((d) => [d.documentId, d.daysLeft])).toEqual([
      ['tonight', 0],
      ['tomorrow', 1],
    ]);
  });

  it('leaves out what is expired, too far, not approved or without a date', () => {
    const found = expiringDocuments(
      {
        requirements,
        documents: [
          document({ id: 'expired', expires_at: '2026-11-10T06:00:00Z' }),
          document({ id: 'far', requirement_id: 'card', expires_at: '2027-02-01T06:00:00Z' }),
          document({ id: 'pending', owner_id: 'v2', status: 'pending_review' }),
          document({ id: 'undated', owner_id: 'v3', expires_at: null }),
        ],
      },
      [truck, { ...truck, id: 'v2' }, { ...truck, id: 'v3' }],
      NOW,
    );
    expect(found).toEqual([]);
  });

  it('reads only the latest active submission of each requirement and owner', () => {
    const found = expiringDocuments(
      {
        requirements,
        documents: [
          document({ id: 'old' }),
          // Replaced by a newer one that lasts a year.
          document({
            id: 'renewed',
            created_at: '2026-11-01T00:00:00Z',
            expires_at: '2027-11-01T06:00:00Z',
          }),
          document({ id: 'archived', requirement_id: 'card', archived_at: NOW.toISOString() }),
        ],
      },
      [truck],
      NOW,
    );
    expect(found).toEqual([]);
  });

  it('counts only the owners on screen, of either kind', () => {
    const found = expiringDocuments(
      {
        requirements,
        documents: [
          document({ id: 'hidden', owner_id: 'v9' }),
          document({ id: 'license', owner_type: 'operator', owner_id: 'o1' }),
          // A requirement no longer in the catalog.
          document({ id: 'retired', requirement_id: 'gone' }),
        ],
      },
      [truck, driver],
      NOW,
    );
    expect(found.map((d) => [d.documentId, d.owner.label])).toEqual([['license', 'Pedro López']]);
  });

  it('takes a narrower window', () => {
    const documents = [document({ id: 'soon' })];
    expect(expiringDocuments({ requirements, documents }, [truck], NOW, 7)).toEqual([]);
    expect(expiringDocuments({ requirements, documents }, [truck], NOW)).toHaveLength(1);
    expect(EXPIRY_WINDOW_DAYS).toBe(30);
  });
});

describe('carrierNegotiationTone', () => {
  it('asks to act only on the carrier’s turn and never paints a dead one', () => {
    expect(carrierNegotiationTone('respond')).toBe('attention');
    expect(carrierNegotiationTone('won')).toBe('done');
    expect(carrierNegotiationTone('awaiting_shipper')).toBe('pending');
    expect(carrierNegotiationTone('open')).toBe('progress');
    expect(carrierNegotiationTone('reopen')).toBe('progress');
    expect(carrierNegotiationTone('lost')).toBe('inactive');
    expect(carrierNegotiationTone('closed')).toBe('inactive');
  });
});

describe('firstOf', () => {
  it('keeps the first items and counts the rest', () => {
    expect(firstOf([1, 2, 3, 4], 3)).toEqual({ shown: [1, 2, 3], more: 1 });
    expect(firstOf([1], 3)).toEqual({ shown: [1], more: 0 });
  });
});
