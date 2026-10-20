import type { Requirement, SubmittedDocument } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import {
  ownerProgress,
  summarizeOperators,
  summarizeVehicles,
  type FleetContext,
  type OperatorRead,
  type VehicleRead,
} from './fleet-summary';

const NOW = new Date('2026-10-19T18:00:00Z');

function requirement(overrides: Partial<Requirement> & Pick<Requirement, 'id'>): Requirement {
  return {
    code: overrides.id,
    name: overrides.id,
    description: null,
    owner_type: 'vehicle',
    company_type: null,
    taxpayer_type: null,
    is_required: true,
    optional_for: [],
    requires_expiry: false,
    sort_order: 0,
    archived_at: null,
    ...overrides,
  };
}

function document(
  overrides: Partial<SubmittedDocument> & Pick<SubmittedDocument, 'id' | 'requirement_id'>,
): SubmittedDocument {
  return {
    owner_type: 'vehicle',
    owner_id: 'v1',
    status: 'approved',
    review_notes: null,
    expires_at: null,
    created_at: '2026-10-01T12:00:00Z',
    archived_at: null,
    file_name: 'doc.pdf',
    ...overrides,
  };
}

function vehicle(id: string, unitName: string | null = 'Corredor MTY–GDL'): VehicleRead {
  return {
    id,
    kind: 'rigid',
    plate: `PL-${id}`,
    fleet_number: null,
    model_year: null,
    unit_type: 'dry_van',
    capacity_kg: 30000,
    capacity_m3: null,
    features: [],
    axle_count: null,
    business_unit_id: 'bu1',
    current_operator_id: null,
    business_unit: unitName === null ? null : { name: unitName },
  };
}

function operator(id: string, unitName: string | null = 'Regional Monterrey'): OperatorRead {
  return {
    id,
    full_name: `Operador ${id}`,
    email: null,
    phone: '+528110000000',
    license_number: null,
    license_type: 'E',
    license_expires_on: '2027-10-19',
    profile_id: null,
    business_unit_id: 'bu2',
    business_unit: unitName === null ? null : { name: unitName },
  };
}

const context = (
  requirements: Requirement[],
  documents: SubmittedDocument[] = [],
): FleetContext => ({
  company: { id: 'c1', type: 'carrier', rfc: 'TRN010101AB1', legal_name: 'Transportes' },
  requirements,
  documents,
});

describe('ownerProgress', () => {
  const vehicleReq = requirement({ id: 'tarjeta', owner_type: 'vehicle', sort_order: 1 });
  const operatorReq = requirement({
    id: 'licencia',
    owner_type: 'operator',
    requires_expiry: true,
  });
  const shipperOnly = requirement({
    id: 'shipper',
    owner_type: 'vehicle',
    company_type: 'shipper',
  });

  it('lists only the requirements of that owner type and company', () => {
    const progress = ownerProgress(
      context([vehicleReq, operatorReq, shipperOnly]),
      { type: 'vehicle', id: 'v1' },
      NOW,
    );
    expect(progress.map((p) => p.requirement.id)).toEqual(['tarjeta']);
    expect(progress[0]?.state).toBe('missing');
  });

  it('reads only the documents of that owner', () => {
    const docs = [
      document({ id: 'd1', requirement_id: 'tarjeta', owner_id: 'v1' }),
      document({ id: 'd2', requirement_id: 'tarjeta', owner_id: 'v2', status: 'rejected' }),
    ];
    const ctx = context([vehicleReq], docs);
    expect(ownerProgress(ctx, { type: 'vehicle', id: 'v1' }, NOW)[0]).toMatchObject({
      state: 'approved',
      document: { id: 'd1' },
    });
    expect(ownerProgress(ctx, { type: 'vehicle', id: 'v2' }, NOW)[0]?.state).toBe('rejected');
  });

  it('marks an approved document past its date as expired', () => {
    const docs = [
      document({
        id: 'd1',
        requirement_id: 'licencia',
        owner_type: 'operator',
        owner_id: 'o1',
        expires_at: '2026-10-01T00:00:00Z',
      }),
    ];
    const progress = ownerProgress(
      context([operatorReq], docs),
      { type: 'operator', id: 'o1' },
      NOW,
    );
    expect(progress[0]?.state).toBe('expired');
  });
});

describe('summarizeVehicles', () => {
  const insurance = requirement({ id: 'seguro', requires_expiry: true });

  it('joins the availability and the business unit name of each unit', () => {
    const [first, second] = summarizeVehicles(
      context(
        [insurance],
        [document({ id: 'd1', requirement_id: 'seguro', expires_at: '2027-01-01T00:00:00Z' })],
      ),
      [vehicle('v1'), vehicle('v2', null)],
      [
        {
          vehicle_id: 'v1',
          available_from: '2026-10-19T12:00:00Z',
          city: 'Monterrey',
          state: 'Nuevo León',
        },
      ],
      new Set(),
      NOW,
    );
    expect(first).toMatchObject({
      id: 'v1',
      businessUnitName: 'Corredor MTY–GDL',
      availability: { city: 'Monterrey' },
      readiness: 'available',
    });
    expect(first).not.toHaveProperty('business_unit');
    expect(second).toMatchObject({ id: 'v2', businessUnitName: null, availability: null });
  });

  it('says a unit without availability is unset and a future one is scheduled', () => {
    const [unset, scheduled] = summarizeVehicles(
      context([]),
      [vehicle('v1'), vehicle('v2')],
      [
        {
          vehicle_id: 'v2',
          available_from: '2026-10-20T12:00:00Z',
          city: 'Guadalajara',
          state: 'Jalisco',
        },
      ],
      new Set(),
      NOW,
    );
    expect(unset?.readiness).toBe('unset');
    expect(scheduled?.readiness).toBe('scheduled');
  });

  it('blocks a unit whose required document expired, even when it is available', () => {
    const docs = [
      document({
        id: 'd1',
        requirement_id: 'seguro',
        owner_id: 'v1',
        expires_at: '2026-10-01T00:00:00Z',
      }),
    ];
    const [summary] = summarizeVehicles(
      context([insurance], docs),
      [vehicle('v1')],
      [
        {
          vehicle_id: 'v1',
          available_from: '2026-10-19T12:00:00Z',
          city: 'Monterrey',
          state: 'Nuevo León',
        },
      ],
      new Set(),
      NOW,
    );
    expect(summary?.readiness).toBe('expired_documents');
  });

  it('ignores an expired document of another unit', () => {
    const docs = [
      document({
        id: 'd1',
        requirement_id: 'seguro',
        owner_id: 'v2',
        expires_at: '2026-10-01T00:00:00Z',
      }),
    ];
    const [summary] = summarizeVehicles(
      context([insurance], docs),
      [vehicle('v1')],
      [
        {
          vehicle_id: 'v1',
          available_from: '2026-10-19T12:00:00Z',
          city: 'Monterrey',
          state: 'Nuevo León',
        },
      ],
      new Set(),
      NOW,
    );
    expect(summary?.readiness).toBe('available');
  });

  it('holds a unit pending release ahead of everything else (G5)', () => {
    const [pending, other] = summarizeVehicles(
      context([]),
      [vehicle('v1'), vehicle('v2')],
      [
        {
          vehicle_id: 'v1',
          available_from: '2026-10-19T12:00:00Z',
          city: 'Monterrey',
          state: 'Nuevo León',
        },
      ],
      new Set(['v1']),
      NOW,
    );
    expect(pending?.readiness).toBe('pending_release');
    expect(other?.readiness).toBe('unset');
  });
});

describe('summarizeOperators', () => {
  it('attaches the pending invitation of each operator by operator id', () => {
    const [withInvite, without] = summarizeOperators(
      [operator('o1'), operator('o2', null)],
      [
        { id: 'i1', operator_id: 'o1', expires_at: '2026-10-26T00:00:00Z' },
        { id: 'i9', operator_id: 'o9', expires_at: '2026-10-26T00:00:00Z' },
      ],
    );
    expect(withInvite).toMatchObject({
      id: 'o1',
      businessUnitName: 'Regional Monterrey',
      invitation: { id: 'i1', expires_at: '2026-10-26T00:00:00Z' },
    });
    expect(withInvite?.invitation).not.toHaveProperty('operator_id');
    expect(withInvite).not.toHaveProperty('business_unit');
    expect(without).toMatchObject({ id: 'o2', businessUnitName: null, invitation: null });
  });
});
