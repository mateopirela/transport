/**
 * "Tu siguiente paso" of the operator's trip (V7, docs/plan-fulmis.md §1.5):
 * from the status the operator sees (queued steps included), the step to take
 * and its words, where it happens, where "Cómo llegar" goes, and how far the
 * trip is along its four steps. No React Native here, so it is tested on its
 * own (next-step.test.ts).
 */
import {
  formatTime,
  nextOperatorEvent,
  operatorNextStepCopy as copy,
  operatorStepActionLabels,
  type OperatorTripEvent,
  type TripEventType,
  type TripStatus,
} from '@transport/shared';

/** An end of the trip: the pickup (origin) or the delivery (destination). */
export type TripStop = 'origin' | 'destination';

export interface NextStep {
  /** The event the step records, or null when there is nothing to record. */
  readonly event: OperatorTripEvent | null;
  /** What to do, as the block's title. */
  readonly title: string;
  /** The label of the step's button (the operator's words), or null without one. */
  readonly action: string | null;
  /** Where the step happens (the block names that place and its window), or null. */
  readonly place: TripStop | null;
  /** Where "Cómo llegar" goes from here, or null once there is nowhere left to drive. */
  readonly directions: TripStop | null;
  /**
   * The step in course among the four of the trip (Recolección, Carga, En
   * ruta, Entrega), from 0; 4 once all are done. What Steps takes as `current`.
   */
  readonly progress: number;
}

/** The four steps of a trip, in order. */
export const TRIP_STEP_COUNT = copy.steps.length;

/** The step in course for each status: driving to the pickup is already the first one. */
const PROGRESS: Readonly<Record<TripStatus, number>> = {
  pending_assignment: -1,
  assigned: 0,
  en_route_to_pickup: 0,
  at_pickup: 1,
  loading: 1,
  in_transit: 2,
  at_delivery: 3,
  unloading: 3,
  delivered: TRIP_STEP_COUNT,
  closed: TRIP_STEP_COUNT,
  cancelled: -1,
};

/** The steps recorded at the pickup; the others happen at the delivery. */
const AT_PICKUP: ReadonlySet<OperatorTripEvent> = new Set([
  'departed',
  'arrived_at_pickup',
  'loading_started',
  'loading_finished',
]);

/** The steps taken before the unit reaches the pickup: "Cómo llegar" still goes there. */
const TO_PICKUP: ReadonlySet<OperatorTripEvent> = new Set(['departed', 'arrived_at_pickup']);

/** The step the operator takes next at `status`, and how it reads. */
export function nextStep(status: TripStatus): NextStep {
  const event = nextOperatorEvent(status);
  const progress = PROGRESS[status];
  if (event === null) {
    const done = status === 'delivered' || status === 'closed';
    return {
      event: null,
      title: done ? copy.doneTitle : copy.waitingTitle,
      action: null,
      place: null,
      directions: null,
      progress,
    };
  }
  return {
    event,
    title: copy.titles[event],
    action: operatorStepActionLabels[event],
    place: AT_PICKUP.has(event) ? 'origin' : 'destination',
    directions: TO_PICKUP.has(event) ? 'origin' : 'destination',
    progress,
  };
}

/** The event that ends each of the four steps, in their order. */
const STEP_ENDS: readonly TripEventType[] = [
  'arrived_at_pickup',
  'loading_finished',
  'arrived_at_delivery',
  'unloading_finished',
];

/**
 * The line under each of the four steps: the time a done step ended (the
 * latest record of its event, sent or still on the phone), "Ahora" under the
 * one in course, nothing under the ones to come.
 */
export function stepDetails(
  progress: number,
  events: readonly { type: TripEventType; occurredAt: string }[],
): (string | undefined)[] {
  return STEP_ENDS.map((end, index) => {
    if (index === progress) return copy.now;
    if (index > progress) return undefined;
    // The server and the phone write their moments differently ("+00:00", "Z"): compare instants.
    const latest = events
      .filter((event) => event.type === end)
      .map((event) => Date.parse(event.occurredAt))
      .filter((at) => Number.isFinite(at))
      .reduce((last, at) => Math.max(last, at), Number.NEGATIVE_INFINITY);
    return Number.isFinite(latest) ? formatTime(latest) : undefined;
  });
}
