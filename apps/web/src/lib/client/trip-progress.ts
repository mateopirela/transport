import { tripProgressCopy, type TripStatus } from '@transport/shared';

import type { StepState } from '@/components/ui/variants';

/*
 * The progress of a trip as the client follows it (docs/plan-fulmis.md §1.5,
 * "viaje en curso con su avance por pasos"): four steps instead of the eleven
 * statuses. Pure, so each status is checked in a test.
 */

export const TRIP_PROGRESS_STEPS = ['assignment', 'pickup', 'transit', 'delivery'] as const;
export type TripProgressStep = (typeof TRIP_PROGRESS_STEPS)[number];

/** The step a status belongs to, or null once the trip ended (delivered, closed, cancelled). */
export function tripProgressStep(status: TripStatus): TripProgressStep | null {
  switch (status) {
    case 'pending_assignment':
    case 'assigned':
      return 'assignment';
    case 'en_route_to_pickup':
    case 'at_pickup':
    case 'loading':
      return 'pickup';
    case 'in_transit':
      return 'transit';
    case 'at_delivery':
    case 'unloading':
      return 'delivery';
    case 'delivered':
    case 'closed':
    case 'cancelled':
      return null;
  }
}

/**
 * The four steps with their state: those before the current one are done, the
 * current one is current, the rest upcoming. A delivered or closed trip has
 * every step done; a cancelled one keeps none done, since it never arrived.
 */
export function tripProgress(
  status: TripStatus,
): { key: TripProgressStep; label: string; state: StepState }[] {
  const current = tripProgressStep(status);
  const reached =
    current === null
      ? status === 'cancelled'
        ? -1
        : TRIP_PROGRESS_STEPS.length
      : TRIP_PROGRESS_STEPS.indexOf(current);
  return TRIP_PROGRESS_STEPS.map((key, index) => ({
    key,
    label: tripProgressCopy.steps[key],
    state: index < reached ? 'done' : index === reached ? 'current' : 'upcoming',
  }));
}
