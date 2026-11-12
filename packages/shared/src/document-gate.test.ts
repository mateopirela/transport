import { describe, expect, it } from 'vitest';

import { carrierTripErrorText } from './carrier-trips';
import { documentGateCopy as copy } from './copy/document-gate';
import {
  documentGate,
  documentGateErrorText,
  documentGateOpen,
  documentGateText,
  joinNames,
  parseOwnerOperatorGate,
  requirementNameForCode,
  unitTravelGate,
  type OwnerOperatorGate,
} from './document-gate';
import { fleetErrorText, vehicleReadiness } from './fleet';
import { releaseErrorText } from './vehicle-release';

const now = new Date('2026-11-12T18:00:00Z');

const requirement = (id: string, code: string, name: string, requiresExpiry = true) => ({
  id,
  code,
  name,
  is_required: true,
  requires_expiry: requiresExpiry,
});

const card = requirement('r-card', 'vehicle_registration_card', 'Tarjeta de circulación');
const insurance = requirement('r-ins', 'vehicle_insurance_policy', 'Seguro vigente');
const permit = requirement('r-permit', 'vehicle_permit', 'Permisos correspondientes');
const license = requirement('r-lic', 'federal_driver_license', 'Licencia de conducir vigente');
const officialId = requirement('r-id', 'operator_official_id', 'Identificación oficial');

const unit = { type: 'vehicle' as const, id: 'v1' };
const operator = { type: 'operator' as const, id: 'o1' };

const doc = (
  requirementId: string,
  over: Partial<{
    owner_type: 'vehicle' | 'operator';
    owner_id: string;
    status: 'approved' | 'pending_review' | 'rejected' | 'expired';
    expires_at: string | null;
    archived_at: string | null;
  }> = {},
) => ({
  requirement_id: requirementId,
  owner_type: 'vehicle' as const,
  owner_id: 'v1',
  status: 'approved' as const,
  expires_at: '2027-11-12T00:00:00Z',
  archived_at: null,
  ...over,
});

describe('documentGate (mirrors *_missing_requirements and *_expired_requirements)', () => {
  it('lets a unit with every required document approved and current travel', () => {
    const gate = documentGate([card, insurance], [doc('r-card'), doc('r-ins')], unit, now);
    expect(documentGateOpen(gate)).toBe(true);
    expect(documentGateText(gate)).toBeNull();
  });

  it('blocks a missing, in review or rejected document as not approved (gap 1)', () => {
    const gate = documentGate(
      [card, insurance, permit],
      [doc('r-ins', { status: 'pending_review' }), doc('r-permit', { status: 'rejected' })],
      unit,
      now,
    );
    expect(gate.notApproved.map((r) => r.code)).toEqual([
      'vehicle_registration_card',
      'vehicle_insurance_policy',
      'vehicle_permit',
    ]);
    expect(gate.expired).toEqual([]);
    expect(documentGateText(gate)).toBe(
      'Falta aprobar: Tarjeta de circulación, Seguro vigente y Permisos correspondientes.',
    );
  });

  it('separates expired documents (marked or past their date) and lists them first', () => {
    const gate = documentGate(
      [card, insurance, permit],
      [doc('r-card', { expires_at: '2026-11-01T00:00:00Z' }), doc('r-ins', { status: 'expired' })],
      unit,
      now,
    );
    expect(gate.expired.map((r) => r.code)).toEqual([
      'vehicle_registration_card',
      'vehicle_insurance_policy',
    ]);
    expect(documentGateText(gate)).toBe(
      'Venció: Tarjeta de circulación y Seguro vigente. Falta aprobar: Permisos correspondientes.',
    );
  });

  it('keeps an expired document blocked while its renewal is in review', () => {
    const gate = documentGate(
      [insurance],
      [doc('r-ins', { status: 'expired' }), doc('r-ins', { status: 'pending_review' })],
      unit,
      now,
    );
    expect(gate.expired.map((r) => r.code)).toEqual(['vehicle_insurance_policy']);
  });

  it('needs a date on an approved document whose requirement asks for one', () => {
    const gate = documentGate([card], [doc('r-card', { expires_at: null })], unit, now);
    expect(gate.notApproved.map((r) => r.code)).toEqual(['vehicle_registration_card']);
  });

  it('ignores optional requirements, archived documents and other owners', () => {
    const gate = documentGate(
      [{ ...card, is_required: false }, insurance],
      [doc('r-ins', { archived_at: '2026-11-01T00:00:00Z' }), doc('r-ins', { owner_id: 'v2' })],
      unit,
      now,
    );
    expect(gate.notApproved.map((r) => r.code)).toEqual(['vehicle_insurance_policy']);
  });

  it('names the operator, and the license alone as JP wrote it', () => {
    const operatorDoc = { owner_type: 'operator' as const, owner_id: 'o1' };
    const expiredLicense = documentGate(
      [license, officialId],
      [
        doc('r-lic', { ...operatorDoc, expires_at: '2026-11-01T00:00:00Z' }),
        doc('r-id', operatorDoc),
      ],
      operator,
      now,
    );
    expect(documentGateText(expiredLicense, 'Pedro López')).toBe(
      'La licencia de Pedro López venció.',
    );
    // gap 3: an operator without an approved official id cannot travel.
    const noId = documentGate([license, officialId], [doc('r-lic', operatorDoc)], operator, now);
    expect(documentGateText(noId, 'Pedro López')).toBe(
      'Falta aprobar: Identificación oficial de Pedro López.',
    );
  });
});

describe('joinNames', () => {
  it('joins Spanish style, without repeating a name', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A y B');
    expect(joinNames(['A', 'B', 'C', 'B'])).toBe('A, B y C');
    expect(joinNames(['Licencia', 'Identificación oficial'])).toBe(
      'Licencia e Identificación oficial',
    );
    expect(joinNames(['Seguro', 'hielo'])).toBe('Seguro y hielo');
  });
});

describe('documentGateErrorText', () => {
  it('translates the unit errors of assign_trip with the document names', () => {
    expect(
      documentGateErrorText(
        'vehicle has missing documents: vehicle_registration_card, vehicle_permit',
        'assign',
      ),
    ).toBe(
      `Falta aprobar: Tarjeta de circulación y Permisos correspondientes. ${copy.errors.assignUnit}`,
    );
    expect(
      documentGateErrorText('vehicle has expired documents: vehicle_insurance_policy', 'assign'),
    ).toBe(`Venció: Seguro vigente. ${copy.errors.assignUnit}`);
  });

  it('translates the operator errors, whose name may hold colons', () => {
    expect(
      documentGateErrorText(
        'operator has expired documents: federal_driver_license: Pedro López',
        'assign',
      ),
    ).toBe(`La licencia de Pedro López venció. ${copy.errors.assignOperator}`);
    expect(
      documentGateErrorText(
        'operator has missing documents: operator_official_id, operator_selfie: Raúl: Méndez',
        'assign',
      ),
    ).toBe(
      `Falta aprobar: Identificación oficial y Selfie de Raúl: Méndez. ${copy.errors.assignOperator}`,
    );
  });

  it('names an unknown code generically, so database text never shows', () => {
    expect(requirementNameForCode('toString')).toBe(copy.otherRequirement);
    expect(
      documentGateErrorText('vehicle has missing documents: some_new_code', 'availability'),
    ).toBe(`Falta aprobar: ${copy.otherRequirement}. ${copy.errors.availability}`);
  });

  it('answers null for any other message', () => {
    expect(documentGateErrorText('vehicle has expired documents', 'assign')).toBeNull();
    expect(documentGateErrorText('vehicle is pending release', 'assign')).toBeNull();
    expect(documentGateErrorText('vehicle has missing documents: DROP TABLE', 'assign')).toBeNull();
  });

  it('is what the trip, fleet and release errors show', () => {
    const message = 'vehicle has missing documents: vehicle_permit';
    expect(carrierTripErrorText(message)).toBe(documentGateErrorText(message, 'assign'));
    expect(fleetErrorText(message)).toBe(documentGateErrorText(message, 'availability'));
    expect(releaseErrorText(message)).toBe(documentGateErrorText(message, 'availability'));
    const owner = 'operator has missing documents: operator_official_id: José Sánchez Medina';
    expect(fleetErrorText(owner)).toBe(documentGateErrorText(owner, 'availability'));
  });
});

describe('unitTravelGate (assert_vehicle_can_travel, owner_operator_ready)', () => {
  const base = { vehicleRequirements: [card, insurance], vehicleId: 'v1' };
  const unitDocs = [doc('r-card'), doc('r-ins')];
  const jose = (over: Partial<OwnerOperatorGate> = {}): OwnerOperatorGate => ({
    isOwnerOperator: true,
    operatorName: 'José Sánchez Medina',
    expired: [],
    notApproved: [],
    ...over,
  });

  it('only reads the unit for a fleet', () => {
    const fleet = { ...jose(), isOwnerOperator: false };
    for (const owner of [null, fleet]) {
      expect(unitTravelGate({ ...base, documents: unitDocs, owner }, now)).toEqual({
        expired: false,
        notApproved: false,
        unitExpired: false,
        unitText: null,
        text: null,
      });
    }
  });

  it('adds the hombre-camión own documents, apart from what assign_trip checks of the unit', () => {
    const gate = unitTravelGate(
      {
        ...base,
        documents: unitDocs,
        owner: jose({ expired: [{ code: license.code, name: license.name }] }),
      },
      now,
    );
    expect(gate).toMatchObject({ expired: true, unitExpired: false, unitText: null });
    expect(gate.text).toBe(copy.operator.licenseExpired('José Sánchez Medina'));
    const pending = unitTravelGate(
      {
        ...base,
        documents: unitDocs,
        owner: jose({ notApproved: [{ code: officialId.code, name: officialId.name }] }),
      },
      now,
    );
    expect(pending.notApproved).toBe(true);
    expect(pending.text).toBe(
      copy.operator.notApproved('Identificación oficial', 'José Sánchez Medina'),
    );
    expect(unitTravelGate({ ...base, documents: unitDocs, owner: jose() }, now).text).toBeNull();
  });

  it('blocks a hombre-camión without an active operator row (archived or never created)', () => {
    const gate = unitTravelGate(
      { ...base, documents: [doc('r-card')], owner: jose({ operatorName: null }) },
      now,
    );
    expect(gate.notApproved).toBe(true);
    expect(gate.unitText).toBe(copy.unit.notApproved('Seguro vigente'));
    expect(gate.text).toBe(
      `${copy.unit.notApproved('Seguro vigente')} ${copy.ownerOperator.missing}`,
    );
  });

  it('reads the gate RPC answer defensively', () => {
    expect(
      parseOwnerOperatorGate({
        isOwnerOperator: true,
        operatorName: 'José',
        expired: [{ code: 'federal_driver_license', name: 'Licencia' }, { code: 1 }],
        notApproved: 'nope',
      }),
    ).toEqual({
      isOwnerOperator: true,
      operatorName: 'José',
      expired: [{ code: 'federal_driver_license', name: 'Licencia' }],
      notApproved: [],
    });
    expect(parseOwnerOperatorGate(null).isOwnerOperator).toBe(false);
    expect(parseOwnerOperatorGate([]).isOwnerOperator).toBe(false);
  });

  it('translates the server error of a missing owner row', () => {
    expect(fleetErrorText('owner operator not found')).toBe(
      `${copy.ownerOperator.missing} ${copy.errors.availability}`,
    );
    expect(releaseErrorText('owner operator not found')).toBe(
      `${copy.ownerOperator.missing} ${copy.errors.availability}`,
    );
  });
});

describe('vehicleReadiness with missing documents (R4)', () => {
  it('ranks missing documents after expired ones and before the availability', () => {
    expect(
      vehicleReadiness(
        { expiredDocuments: false, missingDocuments: true, availableFrom: '2026-11-01T00:00:00Z' },
        now,
      ),
    ).toBe('missing_documents');
    expect(
      vehicleReadiness(
        { expiredDocuments: true, missingDocuments: true, availableFrom: null },
        now,
      ),
    ).toBe('expired_documents');
  });
});
