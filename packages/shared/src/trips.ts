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
