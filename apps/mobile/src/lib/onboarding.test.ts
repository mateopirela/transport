import { currentOnboardingStep, type Requirement, type SubmittedDocument } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import type { CompanyContext } from './fleet-api';
import { carrierOnboarding, operatorOnboarding } from './onboarding';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const OPERATOR = '22222222-2222-4222-8222-222222222222';
const VEHICLE = '33333333-3333-4333-8333-333333333333';

function requirement(
  code: string,
  ownerType: Requirement['owner_type'],
  isRequired = true,
): Requirement {
  return {
    id: `req-${code}`,
    code,
    name: code,
    description: null,
    owner_type: ownerType,
    company_type: ownerType === 'company' ? null : 'carrier',
    taxpayer_type: null,
    is_required: isRequired,
    optional_for: [],
    requires_expiry: false,
    sort_order: 0,
    archived_at: null,
  };
}

function approved(code: string, ownerType: Requirement['owner_type'], ownerId: string) {
  return {
    id: `doc-${code}-${ownerId}`,
    requirement_id: `req-${code}`,
    owner_type: ownerType,
    owner_id: ownerId,
    status: 'approved',
    review_notes: null,
    expires_at: null,
    created_at: '2026-11-01T00:00:00Z',
    archived_at: null,
    file_name: null,
  } satisfies SubmittedDocument;
}

const requirements = [
  requirement('tax_status_certificate', 'company'),
  requirement('legal_representative_id', 'company'),
  requirement('power_of_attorney', 'company', false),
  requirement('vehicle_registration_card', 'vehicle'),
  requirement('operator_official_id', 'operator'),
  requirement('operator_selfie', 'operator'),
];

function context(documents: SubmittedDocument[]): CompanyContext {
  return {
    company: { id: COMPANY, type: 'carrier', rfc: 'SAMJ800101AB1', legal_name: 'José Sánchez' },
    requirements,
    documents,
  };
}

describe('carrierOnboarding', () => {
  it('puts the common company documents in step 3 and nothing else for a Gerente', () => {
    const { work, groups } = carrierOnboarding(
      { context: context([]), operatorId: null, vehicles: [] },
      false,
    );
    expect(work.documents.map((p) => p.requirement.code)).toEqual([
      'legal_representative_id',
      'power_of_attorney',
      'tax_status_certificate',
    ]);
    expect(work.profile).toEqual([]);
    expect(groups.map((g) => g.key)).toEqual(['common']);
    expect(currentOnboardingStep('manager', work)).toBe('documents');
  });

  it('asks a hombre-camión for his truck and his own documents as its operator', () => {
    const company = [
      approved('tax_status_certificate', 'company', COMPANY),
      approved('legal_representative_id', 'company', COMPANY),
    ];
    const withoutTruck = carrierOnboarding(
      { context: context(company), operatorId: OPERATOR, vehicles: [] },
      true,
    );
    expect(withoutTruck.work.profileExtras).toBe(1);
    expect(currentOnboardingStep('owner_operator', withoutTruck.work)).toBe('profile');

    const complete = carrierOnboarding(
      {
        context: context([
          ...company,
          approved('vehicle_registration_card', 'vehicle', VEHICLE),
          approved('operator_official_id', 'operator', OPERATOR),
          approved('operator_selfie', 'operator', OPERATOR),
        ]),
        operatorId: OPERATOR,
        vehicles: [{ id: VEHICLE, plate: 'ABC1234', fleet_number: null }],
      },
      true,
    );
    expect(complete.work.profileExtras).toBe(0);
    expect(complete.groups.map((g) => g.key)).toEqual(['common', VEHICLE, 'operator']);
    expect(currentOnboardingStep('owner_operator', complete.work)).toBe('verification');
  });

  it('counts a missing operator row as something to fix', () => {
    const { work } = carrierOnboarding(
      {
        context: context([]),
        operatorId: null,
        vehicles: [{ id: VEHICLE, plate: 'ABC1234', fleet_number: null }],
      },
      true,
    );
    expect(work.profileExtras).toBe(1);
  });
});

describe('operatorOnboarding', () => {
  it('gives the operator their own documents in step 4', () => {
    const { work, groups } = operatorOnboarding(
      context([approved('operator_official_id', 'operator', OPERATOR)]),
      OPERATOR,
    );
    expect(work.profile.map((p) => [p.requirement.code, p.state])).toEqual([
      ['operator_official_id', 'approved'],
      ['operator_selfie', 'missing'],
    ]);
    expect(groups).toHaveLength(1);
    expect(currentOnboardingStep('operator', work)).toBe('profile');
  });
});
