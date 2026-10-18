import { describe, expect, it } from 'vitest';

import {
  canAddTripDocuments,
  canAssignTrip,
  canCancelTrip,
  carrierTripErrorText,
  carrierTripGroup,
  checkAssignment,
  defaultAssignment,
  groupCarrierTrips,
  licenseAllowsLoad,
  licenseAllowsVehicle,
  licensePairsFrom,
  loadedLegProgress,
  locationFreshness,
  mapPointUrl,
  operatorLicenseCurrent,
  projectToBox,
  tripDocumentFileIssue,
  tripDocumentStoragePath,
  type AssignableOperator,
  type AssignableUnit,
} from './carrier-trips';
import { carrierTripsCopy } from './copy/carrier-trips';
import { TRIP_STATUSES } from './enums';

describe('tripDocumentStoragePath', () => {
  const tripId = '5eed0008-0000-4000-8000-000000000001';
  const fileId = '0b6f1d2e-3c4a-4b5c-8d6e-7f8091a2b3c4';

  it('builds {trip}/{uuid}.{ext} from the MIME type', () => {
    expect(tripDocumentStoragePath({ tripId, fileId, mimeType: 'application/pdf' })).toBe(
      `${tripId}/${fileId}.pdf`,
    );
    expect(tripDocumentStoragePath({ tripId, fileId, mimeType: 'image/jpeg' })).toBe(
      `${tripId}/${fileId}.jpg`,
    );
  });

  it('rejects types the bucket refuses and malformed ids', () => {
    expect(() => tripDocumentStoragePath({ tripId, fileId, mimeType: 'image/heic' })).toThrow(
      RangeError,
    );
    expect(() => tripDocumentStoragePath({ tripId: 'x', fileId, mimeType: 'image/png' })).toThrow(
      RangeError,
    );
  });

  it('accepts what the trip-documents bucket accepts (15 MB, PDF or image)', () => {
    const mb = 1024 * 1024;
    expect(tripDocumentFileIssue({ size: 12 * mb, type: 'application/pdf' })).toBeNull();
    expect(tripDocumentFileIssue({ size: 16 * mb, type: 'application/pdf' })).toBe('tooLarge');
    expect(tripDocumentFileIssue({ size: 0, type: 'image/jpeg' })).toBe('empty');
    expect(tripDocumentFileIssue({ size: mb, type: 'image/heic' })).toBe('type');
  });

  it('allows documents unless the trip was cancelled', () => {
    expect(TRIP_STATUSES.filter((s) => !canAddTripDocuments(s))).toEqual(['cancelled']);
  });
});

const MTY = { lat: 25.6866, lng: -100.3161 };
const GDL = { lat: 20.6597, lng: -103.3496 };
const SALTILLO = { lat: 25.4232, lng: -101.0053 };

const unit = (over: Partial<AssignableUnit> = {}): AssignableUnit => ({
  id: 'u1',
  kind: 'trailer',
  unitType: 'dry_van',
  expiredDocuments: false,
  currentOperatorId: null,
  otherTrips: 0,
  ...over,
});

const operator = (over: Partial<AssignableOperator> = {}): AssignableOperator => ({
  id: 'o1',
  hasAccount: true,
  licenseType: 'E',
  licenseCurrent: true,
  otherTrips: 0,
  ...over,
});

describe('license <-> unit kind (D16)', () => {
  it('mirrors license_unit_compatibility: B and E drive everything, C only rigid units', () => {
    expect(licenseAllowsVehicle('B', 'tractor')).toBe(true);
    expect(licenseAllowsVehicle('B', 'trailer')).toBe(true);
    expect(licenseAllowsVehicle('C', 'rigid')).toBe(true);
    expect(licenseAllowsVehicle('C', 'tractor')).toBe(false);
    expect(licenseAllowsVehicle('C', 'trailer')).toBe(false);
    expect(licenseAllowsVehicle('E', 'tractor')).toBe(true);
    expect(licenseAllowsVehicle(null, 'rigid')).toBe(false);
  });

  it('needs type E for a load with a hazmat permit', () => {
    expect(licenseAllowsLoad('C', ['hazmat_permit'])).toBe(false);
    expect(licenseAllowsLoad('B', ['tarp'])).toBe(true);
    expect(licenseAllowsLoad('E', ['hazmat_permit', 'tarp'])).toBe(true);
    expect(licenseAllowsLoad(null, [])).toBe(false);
  });

  it('follows the table the admin edits: pairs switched off or added win over the seeded list', () => {
    const pairs = licensePairsFrom([
      { license_type: 'C', vehicle_kind: 'rigid', allowed: true },
      { license_type: 'C', vehicle_kind: 'tractor', allowed: true },
      { license_type: 'E', vehicle_kind: 'tractor', allowed: false },
      { license_type: 'E', vehicle_kind: 'rigid', allowed: true },
    ]);
    expect(pairs).toEqual({ B: [], C: ['rigid', 'tractor'], E: ['rigid'] });
    expect(licenseAllowsVehicle('C', 'tractor', pairs)).toBe(true);
    expect(licenseAllowsVehicle('E', 'tractor', pairs)).toBe(false);
    expect(licenseAllowsVehicle('B', 'rigid', pairs)).toBe(false);
    expect(
      checkAssignment({
        unit: unit({ kind: 'tractor' }),
        operator: operator({ licenseType: 'C' }),
        loadUnitType: 'dry_van',
        licensePairs: pairs,
      }).blockers,
    ).toEqual([]);
  });
});

describe('carrierTripGroup', () => {
  it('puts every status in one section', () => {
    expect(Object.fromEntries(TRIP_STATUSES.map((s) => [s, carrierTripGroup(s)]))).toEqual({
      pending_assignment: 'to_assign',
      assigned: 'upcoming',
      en_route_to_pickup: 'active',
      at_pickup: 'active',
      loading: 'active',
      in_transit: 'active',
      at_delivery: 'active',
      unloading: 'active',
      delivered: 'history',
      closed: 'history',
      cancelled: 'history',
    });
  });

  it('allows assigning only before the departure, as assign_trip', () => {
    expect(TRIP_STATUSES.filter(canAssignTrip)).toEqual(['pending_assignment', 'assigned']);
  });
});

describe('groupCarrierTrips', () => {
  it('sorts open trips by pickup and the history by the latest change', () => {
    const trips = [
      { id: 'a', status: 'assigned', pickupAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-10' },
      { id: 'b', status: 'assigned', pickupAt: '2026-10-18T10:00:00Z', updatedAt: '2026-10-10' },
      { id: 'c', status: 'closed', pickupAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-03' },
      { id: 'd', status: 'cancelled', pickupAt: '2026-10-02T10:00:00Z', updatedAt: '2026-10-05' },
      {
        id: 'e',
        status: 'pending_assignment',
        pickupAt: '2026-10-19T10:00:00Z',
        updatedAt: '2026-10-10',
      },
      { id: 'f', status: 'in_transit', pickupAt: '2026-10-15T10:00:00Z', updatedAt: '2026-10-15' },
    ] as const;
    const groups = groupCarrierTrips(trips);
    expect(groups.to_assign.map((t) => t.id)).toEqual(['e']);
    expect(groups.upcoming.map((t) => t.id)).toEqual(['b', 'a']);
    expect(groups.active.map((t) => t.id)).toEqual(['f']);
    expect(groups.history.map((t) => t.id)).toEqual(['d', 'c']);
  });
});

describe('checkAssignment', () => {
  it('needs a unit and an operator', () => {
    expect(
      checkAssignment({ unit: null, operator: operator(), loadUnitType: 'dry_van' }).blockers,
    ).toEqual(['missingSelection']);
  });

  it('blocks operators without an account and units with expired documents', () => {
    expect(
      checkAssignment({
        unit: unit({ expiredDocuments: true }),
        operator: operator({ hasAccount: false }),
        loadUnitType: 'dry_van',
      }),
    ).toEqual({ blockers: ['operatorWithoutAccount', 'unitExpired'], warnings: [] });
  });

  it('blocks an operator whose license is expired or does not fit the unit or the cargo (D16)', () => {
    expect(
      checkAssignment({
        unit: unit({ kind: 'tractor' }),
        operator: operator({ licenseType: 'C', licenseCurrent: false }),
        loadUnitType: 'dry_van',
      }).blockers,
    ).toEqual(['operatorLicenseExpired', 'operatorLicenseMismatch']);
    expect(
      checkAssignment({
        unit: unit({ kind: 'rigid' }),
        operator: operator({ licenseType: 'C' }),
        loadUnitType: 'dry_van',
        loadRequirements: ['hazmat_permit'],
      }).blockers,
    ).toEqual(['operatorLicenseMismatch']);
    expect(
      checkAssignment({
        unit: unit({ kind: 'rigid' }),
        operator: operator({ licenseType: 'C' }),
        loadUnitType: 'dry_van',
      }).blockers,
    ).toEqual([]);
  });

  it('warns about a different unit type and units or operators on other trips', () => {
    expect(
      checkAssignment({
        unit: unit({ unitType: 'flatbed', otherTrips: 1 }),
        operator: operator({ otherTrips: 2 }),
        loadUnitType: 'dry_van',
      }),
    ).toEqual({ blockers: [], warnings: ['unitTypeMismatch', 'unitBusy', 'operatorBusy'] });
  });

  it('passes a ready pair', () => {
    expect(
      checkAssignment({ unit: unit(), operator: operator(), loadUnitType: 'dry_van' }),
    ).toEqual({ blockers: [], warnings: [] });
  });
});

describe('defaultAssignment', () => {
  const units = [unit({ id: 'u1', currentOperatorId: 'o2' }), unit({ id: 'u2' })];
  const operators = [operator({ id: 'o1' }), operator({ id: 'o2' })];

  it('keeps the current assignment', () => {
    expect(
      defaultAssignment({
        current: { vehicleId: 'u2', operatorId: 'o1' },
        offeredUnitId: 'u1',
        units,
        operators,
      }),
    ).toEqual({ vehicleId: 'u2', operatorId: 'o1' });
  });

  it('starts from the offered unit and its usual operator', () => {
    expect(
      defaultAssignment({
        current: { vehicleId: null, operatorId: null },
        offeredUnitId: 'u1',
        units,
        operators,
      }),
    ).toEqual({ vehicleId: 'u1', operatorId: 'o2' });
  });

  it('skips an offered unit with expired documents and an usual operator without account', () => {
    expect(
      defaultAssignment({
        current: { vehicleId: null, operatorId: null },
        offeredUnitId: 'u1',
        units: [unit({ id: 'u1', expiredDocuments: true, currentOperatorId: 'o2' })],
        operators: [operator({ id: 'o2', hasAccount: false })],
      }),
    ).toEqual({ vehicleId: null, operatorId: null });
  });

  it('picks the only unit and the only operator with an account', () => {
    expect(
      defaultAssignment({
        current: { vehicleId: null, operatorId: null },
        offeredUnitId: null,
        units: [unit({ id: 'u9' })],
        operators: [operator({ id: 'o1', hasAccount: false }), operator({ id: 'o3' })],
      }),
    ).toEqual({ vehicleId: 'u9', operatorId: 'o3' });
  });
});

describe('locationFreshness', () => {
  const now = new Date('2026-10-16T12:00:00Z');

  it('is live up to 15 minutes, then stale', () => {
    expect(locationFreshness('2026-10-16T11:50:00Z', now)).toBe('live');
    expect(locationFreshness('2026-10-16T11:44:00Z', now)).toBe('stale');
    expect(locationFreshness(null, now)).toBe('none');
  });
});

describe('loadedLegProgress', () => {
  it('goes from 0 at the origin to 1 at the destination', () => {
    expect(loadedLegProgress(MTY, GDL, MTY)).toBe(0);
    expect(loadedLegProgress(MTY, GDL, GDL)).toBe(1);
    const saltillo = loadedLegProgress(MTY, GDL, SALTILLO);
    expect(saltillo).toBeGreaterThan(0);
    expect(saltillo).toBeLessThan(0.2);
  });

  it('clamps points farther than the origin', () => {
    expect(loadedLegProgress(SALTILLO, GDL, MTY)).toBe(0);
  });
});

describe('projectToBox', () => {
  it('keeps north up, fits the box and preserves the aspect ratio', () => {
    const [mty, gdl] = projectToBox([MTY, GDL], { width: 300, height: 200, padding: 10 });
    expect(mty && gdl).toBeTruthy();
    if (!mty || !gdl) return;
    // MTY is north-east of GDL.
    expect(mty.y).toBeLessThan(gdl.y);
    expect(mty.x).toBeGreaterThan(gdl.x);
    for (const p of [mty, gdl]) {
      expect(p.x).toBeGreaterThanOrEqual(10);
      expect(p.x).toBeLessThanOrEqual(290);
      expect(p.y).toBeGreaterThanOrEqual(10);
      expect(p.y).toBeLessThanOrEqual(190);
    }
    // The taller span (latitude) fills the inner height.
    expect(gdl.y - mty.y).toBeCloseTo(180, 5);
  });

  it('centers a single point and handles no points', () => {
    expect(projectToBox([MTY], { width: 100, height: 50 })).toEqual([{ x: 50, y: 25 }]);
    expect(projectToBox([], { width: 100, height: 50 })).toEqual([]);
  });
});

describe('mapPointUrl', () => {
  it('opens the point in the maps app', () => {
    expect(mapPointUrl({ lat: 20.5, lng: -103.25 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=20.5,-103.25',
    );
  });
});

describe('canCancelTrip', () => {
  it('mirrors cancel_trip for the carrier staff: until the operator starts loading', () => {
    const allowed = TRIP_STATUSES.filter(canCancelTrip);
    expect(allowed).toEqual(['pending_assignment', 'assigned', 'en_route_to_pickup', 'at_pickup']);
  });
});

describe('operatorLicenseCurrent', () => {
  const now = new Date('2026-10-15T18:00:00Z');
  const license = { id: 'req-1', code: 'federal_driver_license' };
  const operator = { id: 'op-1', license_expires_on: null };
  const approved = {
    requirement_id: 'req-1',
    owner_type: 'operator' as const,
    owner_id: 'op-1',
    status: 'approved' as const,
    expires_at: '2027-01-01T00:00:00Z',
    archived_at: null,
  };

  it('is current with a license date today or later', () => {
    expect(
      operatorLicenseCurrent({ ...operator, license_expires_on: '2026-10-15' }, [], [], now),
    ).toBe(true);
    expect(
      operatorLicenseCurrent({ ...operator, license_expires_on: '2026-10-14' }, [], [], now),
    ).toBe(false);
  });

  it('is current with an approved unexpired license document of the operator', () => {
    expect(operatorLicenseCurrent(operator, [license], [approved], now)).toBe(true);
    expect(
      operatorLicenseCurrent(operator, [license], [{ ...approved, status: 'pending_review' }], now),
    ).toBe(false);
    expect(
      operatorLicenseCurrent(
        operator,
        [license],
        [{ ...approved, expires_at: '2026-10-01T00:00:00Z' }],
        now,
      ),
    ).toBe(false);
    expect(
      operatorLicenseCurrent(operator, [license], [{ ...approved, owner_id: 'op-2' }], now),
    ).toBe(false);
    expect(operatorLicenseCurrent(operator, [], [approved], now)).toBe(false);
  });
});

describe('carrierTripErrorText', () => {
  const e = carrierTripsCopy.errors;

  it('maps the fixed messages of assign_trip, cancel_trip and add_trip_document', () => {
    expect(carrierTripErrorText('trip not found')).toBe(e.notFound);
    expect(carrierTripErrorText('cannot assign a trip in status in_transit')).toBe(e.notAssignable);
    expect(carrierTripErrorText('cannot cancel a trip in status loading')).toBe(e.notCancellable);
    expect(carrierTripErrorText('a reason of at most 1000 characters is required')).toBe(
      e.cancelReason,
    );
    expect(carrierTripErrorText('operator license is missing or expired: Pedro López')).toBe(
      e.operatorLicenseExpired('Pedro López'),
    );
    expect(carrierTripErrorText('operator license is not suitable for this vehicle: Raúl')).toBe(
      e.operatorLicenseMismatch('Raúl'),
    );
    expect(carrierTripErrorText('the shipper side does not upload invoice')).toBe(
      e.documentSideNotAllowed,
    );
    expect(carrierTripErrorText('file was not uploaded')).toBe(e.invalidFile);
  });

  it('leaves unknown messages to the caller', () => {
    expect(carrierTripErrorText('')).toBeNull();
    expect(carrierTripErrorText('something else')).toBeNull();
  });
});
