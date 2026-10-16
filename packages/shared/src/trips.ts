// Trip execution helpers (B06). Postgres enforces the same rules in the trip
// RPCs (record_trip_event, record_trip_locations, trip_is_active); this module
// lets the apps show the right next action and decide when to track.
import type { TripEventType, TripStatus } from './enums';

/** Events the assigned operator records, with the status each needs and leads to. */
export const OPERATOR_TRIP_EVENTS = {
  departed: { from: 'assigned', to: 'en_route_to_pickup' },
  arrived_at_pickup: { from: 'en_route_to_pickup', to: 'at_pickup' },
  loading_started: { from: 'at_pickup', to: 'loading' },
  loading_finished: { from: 'loading', to: 'in_transit' },
  arrived_at_delivery: { from: 'in_transit', to: 'at_delivery' },
  unloading_started: { from: 'at_delivery', to: 'unloading' },
  unloading_finished: { from: 'unloading', to: 'delivered' },
} as const satisfies Partial<Record<TripEventType, { from: TripStatus; to: TripStatus }>>;

export type OperatorTripEvent = keyof typeof OPERATOR_TRIP_EVENTS;

/** Statuses in which the unit is on the road and the operator shares its location. */
export const ACTIVE_TRIP_STATUSES = [
  'en_route_to_pickup',
  'at_pickup',
  'loading',
  'in_transit',
  'at_delivery',
  'unloading',
] as const satisfies readonly TripStatus[];

/** Maximum GPS points per `record_trip_locations` call. */
export const MAX_LOCATION_BATCH = 500;

/** Whether a trip is on the road (mirrors `trip_is_active` in SQL). */
export function isTripActive(status: TripStatus): boolean {
  return (ACTIVE_TRIP_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether the device should keep tracking: only while the trip is active
 * (privacy, B22). The shipper sees the locations under the same rule.
 */
export const shouldTrackLocation = isTripActive;

/** The next status event the operator can record, or null when there is none. */
export function nextOperatorEvent(status: TripStatus): OperatorTripEvent | null {
  for (const [event, step] of Object.entries(OPERATOR_TRIP_EVENTS)) {
    if (step.from === status) return event as OperatorTripEvent;
  }
  return null;
}

/** Starting to unload asks for the estimated end of unloading (D11). */
export function requiresUnloadEstimate(event: TripEventType): boolean {
  return event === 'unloading_started';
}

/** Operator status events in the order they happen on the road (B21). */
export const OPERATOR_TRIP_STEPS = Object.keys(OPERATOR_TRIP_EVENTS) as OperatorTripEvent[];

/**
 * Status after applying operator events in order, or null when one of them
 * does not follow (it would skip or repeat a step). The app uses it to show
 * the trip as it will be once the offline queue is sent.
 */
export function statusAfterEvents(
  status: TripStatus,
  events: readonly OperatorTripEvent[],
): TripStatus | null {
  let current: TripStatus = status;
  for (const event of events) {
    const step = OPERATOR_TRIP_EVENTS[event];
    if (step.from !== current) return null;
    current = step.to;
  }
  return current;
}

/** Statuses in which a trip shows up in the operator's "Viaje asignado" screen. */
const OPERATOR_SCREEN_PRIORITY: Partial<Record<TripStatus, number>> = {
  ...Object.fromEntries(ACTIVE_TRIP_STATUSES.map((status) => [status, 0])),
  assigned: 1,
  // Delivered: the operator may still owe evidence (B23) until the shipper confirms.
  delivered: 2,
};

/**
 * The trip the operator works on now: the one on the road, else the next
 * assigned one (earliest pickup), else the latest delivered. Null if none.
 */
export function pickOperatorTrip<T extends { status: TripStatus; pickupAt: string }>(
  trips: readonly T[],
): T | null {
  // Lower is better: priority first, then the earliest pickup (latest if delivered).
  const rank = (trip: T): [number, number] => {
    const priority = OPERATOR_SCREEN_PRIORITY[trip.status] ?? Infinity;
    const pickup = Date.parse(trip.pickupAt);
    return [priority, trip.status === 'delivered' ? -pickup : pickup];
  };
  let best: T | null = null;
  for (const trip of trips) {
    if (OPERATOR_SCREEN_PRIORITY[trip.status] === undefined) continue;
    if (best === null) {
      best = trip;
      continue;
    }
    const [p, t] = rank(trip);
    const [bp, bt] = rank(best);
    if (p < bp || (p === bp && t < bt)) best = trip;
  }
  return best;
}

/** Latest estimated end of unloading the app accepts, from the moment it is given. */
export const MAX_UNLOAD_ESTIMATE_DAYS = 30;

/**
 * Why an estimated end of unloading is not acceptable at `at` (the moment it
 * is recorded), or null if it is. Mirrors the range checked by
 * record_trip_event: not before `at` and at most 30 days after it.
 */
export function unloadEstimateProblem(estimate: Date, at: Date): 'beforeNow' | 'tooFar' | null {
  if (estimate.getTime() < at.getTime()) return 'beforeNow';
  if (estimate.getTime() > at.getTime() + MAX_UNLOAD_ESTIMATE_DAYS * 24 * 60 * 60 * 1000) {
    return 'tooFar';
  }
  return null;
}
