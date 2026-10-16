// Carrier side of trips (B20): the trips list grouped by what the carrier has
// to do, the assignment of unit and operator, and the monitoring of trips on
// the road (last position, progress and a schematic map that needs no Maps
// key). Pure, so the rules are unit-tested; Postgres validates the assignment
// again in assign_trip (B06).
import type { TripStatus, UnitType } from './enums';
import { haversineKm, type LatLng } from './geo';
import { isTripActive } from './trips';

/** Sections of the carrier's trips tab. */
export type CarrierTripGroup = 'to_assign' | 'upcoming' | 'active' | 'history';

export const CARRIER_TRIP_GROUPS = [
  'to_assign',
  'active',
  'upcoming',
  'history',
] as const satisfies readonly CarrierTripGroup[];

/** Which section a trip belongs to. Delivered trips wait for the shipper in history. */
export function carrierTripGroup(status: TripStatus): CarrierTripGroup {
  if (status === 'pending_assignment') return 'to_assign';
  if (status === 'assigned') return 'upcoming';
  if (isTripActive(status)) return 'active';
  return 'history';
}

/** The carrier can (re)assign until the operator departs (mirrors assign_trip). */
export function canAssignTrip(status: TripStatus): boolean {
  return status === 'pending_assignment' || status === 'assigned';
}

export interface GroupableTrip {
  status: TripStatus;
  /** Start of the pickup window. */
  pickupAt: string;
  /** Last change of the trip (history is sorted by it). */
  updatedAt: string;
}

/**
 * Trips by section: the ones to assign, upcoming and active by the soonest
 * pickup; the history by the most recent change.
 */
export function groupCarrierTrips<T extends GroupableTrip>(
  trips: readonly T[],
): Record<CarrierTripGroup, T[]> {
  const groups: Record<CarrierTripGroup, T[]> = {
    to_assign: [],
    active: [],
    upcoming: [],
    history: [],
  };
  for (const trip of trips) groups[carrierTripGroup(trip.status)].push(trip);
  const byPickup = (a: T, b: T) => Date.parse(a.pickupAt) - Date.parse(b.pickupAt);
  groups.to_assign.sort(byPickup);
  groups.active.sort(byPickup);
  groups.upcoming.sort(byPickup);
  groups.history.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return groups;
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export interface AssignableUnit {
  id: string;
  unitType: UnitType | null;
  /** A required document is expired: assign_trip rejects it. */
  expiredDocuments: boolean;
  /** Operator the fleet usually pairs with this unit. */
  currentOperatorId: string | null;
  /** Other trips of the carrier this unit is assigned to and not yet delivered. */
  otherTrips: number;
}

export interface AssignableOperator {
  id: string;
  /** Only operators who accepted their invitation can record the trip. */
  hasAccount: boolean;
  otherTrips: number;
}

/** Reasons the server would reject an assignment: the button stays disabled. */
export type AssignmentBlocker = 'missingSelection' | 'operatorWithoutAccount' | 'unitExpired';

/** Allowed, but worth a second look before confirming. */
export type AssignmentWarning = 'unitTypeMismatch' | 'unitBusy' | 'operatorBusy';

export interface AssignmentCheck {
  blockers: AssignmentBlocker[];
  warnings: AssignmentWarning[];
}

/** What stops or deserves a warning in assigning `unit` and `operator` to a load. */
export function checkAssignment({
  unit,
  operator,
  loadUnitType,
}: {
  unit: AssignableUnit | null;
  operator: AssignableOperator | null;
  loadUnitType: UnitType;
}): AssignmentCheck {
  const blockers: AssignmentBlocker[] = [];
  const warnings: AssignmentWarning[] = [];
  if (!unit || !operator) blockers.push('missingSelection');
  if (operator && !operator.hasAccount) blockers.push('operatorWithoutAccount');
  if (unit?.expiredDocuments) blockers.push('unitExpired');
  if (unit?.unitType && unit.unitType !== loadUnitType) warnings.push('unitTypeMismatch');
  if (unit && unit.otherTrips > 0) warnings.push('unitBusy');
  if (operator && operator.otherTrips > 0) warnings.push('operatorBusy');
  return { blockers, warnings };
}

/**
 * The unit and operator the form starts with: the current assignment, else the
 * unit offered in the winning offer (when it is still usable) with its usual
 * operator (when they have an account).
 */
export function defaultAssignment({
  current,
  offeredUnitId,
  units,
  operators,
}: {
  current: { vehicleId: string | null; operatorId: string | null };
  offeredUnitId: string | null;
  units: readonly AssignableUnit[];
  operators: readonly AssignableOperator[];
}): { vehicleId: string | null; operatorId: string | null } {
  if (current.vehicleId && current.operatorId) return current;
  const unit =
    units.find((u) => u.id === offeredUnitId && !u.expiredDocuments) ??
    (units.length === 1 && !units[0]?.expiredDocuments ? units[0] : undefined);
  const usual = operators.find((o) => o.id === unit?.currentOperatorId && o.hasAccount);
  const onlyOperator = operators.filter((o) => o.hasAccount);
  const operator = usual ?? (onlyOperator.length === 1 ? onlyOperator[0] : undefined);
  return { vehicleId: unit?.id ?? null, operatorId: operator?.id ?? null };
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

/** Minutes without a GPS point after which an active trip shows "sin señal". */
export const LOCATION_STALE_AFTER_MINUTES = 15;

export type LocationFreshness = 'live' | 'stale' | 'none';

/** Whether the last point of an active trip is recent, old or missing. */
export function locationFreshness(
  lastRecordedAt: string | null,
  now: Date,
  staleAfterMinutes: number = LOCATION_STALE_AFTER_MINUTES,
): LocationFreshness {
  if (!lastRecordedAt) return 'none';
  const age = now.getTime() - Date.parse(lastRecordedAt);
  return age > staleAfterMinutes * 60 * 1000 ? 'stale' : 'live';
}

/**
 * Share of the loaded leg already covered (0 to 1), from the straight-line
 * distance left to the destination. A rough indicator for the list, not a
 * route-based ETA.
 */
export function loadedLegProgress(origin: LatLng, destination: LatLng, current: LatLng): number {
  const total = haversineKm(origin, destination);
  if (total === 0) return 1;
  const left = haversineKm(current, destination);
  return Math.min(1, Math.max(0, 1 - left / total));
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

/**
 * Projects coordinates into a `width` × `height` box (equirectangular, scaled
 * by the cosine of the mean latitude, north up), keeping the aspect ratio and
 * a `padding` margin. It draws the schematic map shown while there is no Maps
 * SDK key. All points share one scale, so distances stay comparable.
 */
export function projectToBox(
  points: readonly LatLng[],
  { width, height, padding = 0 }: { width: number; height: number; padding?: number },
): ProjectedPoint[] {
  if (points.length === 0) return [];
  const meanLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const kx = Math.cos((meanLat * Math.PI) / 180);
  const xs = points.map((p) => p.lng * kx);
  const ys = points.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const innerW = Math.max(0, width - 2 * padding);
  const innerH = Math.max(0, height - 2 * padding);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scale =
    spanX === 0 && spanY === 0
      ? 0
      : Math.min(spanX === 0 ? Infinity : innerW / spanX, spanY === 0 ? Infinity : innerH / spanY);
  // Center the drawing in the box.
  const offsetX = padding + (innerW - spanX * scale) / 2;
  const offsetY = padding + (innerH - spanY * scale) / 2;
  return points.map((_, i) => ({
    x: offsetX + ((xs[i] ?? 0) - minX) * scale,
    y: offsetY + (maxY - (ys[i] ?? 0)) * scale,
  }));
}

/** Link that opens a point in the phone's maps app (no key needed). */
export function mapPointUrl({ lat, lng }: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
