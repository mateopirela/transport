// Carga de regreso (I7, D40). Postgres decides when a trip is checked and who
// is notified (check_backhaul, 20261110070100_backhaul_suggestions.sql); this
// is its mirror, so the rule is unit-tested, plus what the trip screens show
// in "Para el regreso": the best return loads of the trip's unit, ranked by
// the same pure code as the home feed (no new scoring).
import { buildCarrierFeed, RETURN_TRIPS_PER_UNIT, type Recommendation } from './carrier-loads';
import type { TripStatus } from './enums';

/** A trip is checked when its operator comes this close to the destination (mirrored in SQL). */
export const BACKHAUL_PROXIMITY_KM = 50;

/** How far from the destination a pickup counts as near: the recommendations' radius (mirrored in SQL). */
export const BACKHAUL_RADIUS_KM = 150;

/** Return loads shown in "Para el regreso": the same 3 as the home feed. */
export const BACKHAUL_SUGGESTIONS = RETURN_TRIPS_PER_UNIT;

/** From the end of the loading until the unloading ends. */
export const BACKHAUL_TRIP_STATUSES = [
  'in_transit',
  'at_delivery',
  'unloading',
] as const satisfies readonly TripStatus[];

/** What started the check of a trip: its arrival at the delivery or the operator's location. */
export type BackhaulSource = 'arrival' | 'proximity';

/** The check already recorded for a trip (trip_backhaul_checks). */
export interface BackhaulCheck {
  source: BackhaulSource;
  notifiedAt: string | null;
}

export function isBackhaulTripStatus(status: TripStatus): boolean {
  return (BACKHAUL_TRIP_STATUSES as readonly TripStatus[]).includes(status);
}

/**
 * Whether a trip is checked for return loads now (check_backhaul, once per
 * trip): only from the end of the loading on; a location counts within
 * BACKHAUL_PROXIMITY_KM of the destination and only for a trip never
 * checked; the arrival checks a trip never checked, or one that proximity
 * checked without finding loads (they may have appeared since). A trip that
 * notified is never checked again.
 */
export function shouldCheckBackhaul(input: {
  source: BackhaulSource;
  status: TripStatus;
  /** Distance from the operator's point to the destination, for `proximity`. */
  distanceKm?: number | null;
  previous: BackhaulCheck | null;
}): boolean {
  const { source, status, distanceKm, previous } = input;
  if (!isBackhaulTripStatus(status)) return false;
  if (source === 'proximity') {
    return (
      previous === null &&
      typeof distanceKm === 'number' &&
      Number.isFinite(distanceKm) &&
      distanceKm <= BACKHAUL_PROXIMITY_KM
    );
  }
  return previous === null || (previous.source === 'proximity' && previous.notifiedAt === null);
}

/**
 * The return loads of "Para el regreso" from the unit's recommendations: the
 * return trips only (from where the unit finishes), best first, at most
 * BACKHAUL_SUGGESTIONS. Same selection and order as the home feed.
 */
export function backhaulSuggestions(
  vehicleId: string,
  recommendations: readonly Recommendation[],
): Recommendation[] {
  const [group] = buildCarrierFeed([{ vehicleId, recommendations }]).returnTrips;
  return group ? group.recommendations.slice(0, BACKHAUL_SUGGESTIONS) : [];
}
