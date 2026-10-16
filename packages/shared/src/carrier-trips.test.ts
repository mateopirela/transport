import { describe, expect, it } from 'vitest';

import {
  canAddTripDocuments,
  canAssignTrip,
  carrierTripGroup,
  checkAssignment,
  defaultAssignment,
  groupCarrierTrips,
  loadedLegProgress,
  locationFreshness,
  mapPointUrl,
  projectToBox,
  tripDocumentStoragePath,
  type AssignableOperator,
  type AssignableUnit,
} from './carrier-trips';
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

  it('allows documents unless the trip was cancelled', () => {
    expect(TRIP_STATUSES.filter((s) => !canAddTripDocuments(s))).toEqual(['cancelled']);
  });
});

const MTY = { lat: 25.6866, lng: -100.3161 };
const GDL = { lat: 20.6597, lng: -103.3496 };
const SALTILLO = { lat: 25.4232, lng: -101.0053 };

const unit = (over: Partial<AssignableUnit> = {}): AssignableUnit => ({
  id: 'u1',
  unitType: 'dry_van',
  expiredDocuments: false,
  currentOperatorId: null,
  otherTrips: 0,
  ...over,
});

const operator = (over: Partial<AssignableOperator> = {}): AssignableOperator => ({
  id: 'o1',
  hasAccount: true,
  otherTrips: 0,
  ...over,
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
