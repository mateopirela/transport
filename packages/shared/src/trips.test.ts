import { describe, expect, it } from 'vitest';

import { TRIP_EVENT_TYPES, TRIP_STATUSES, type TripStatus } from './enums';
import { canTransition, nextStatuses } from './state-machines';
import {
  ACTIVE_TRIP_STATUSES,
  OPERATOR_TRIP_EVENTS,
  isTripActive,
  nextOperatorEvent,
  requiresUnloadEstimate,
  shouldTrackLocation,
  type OperatorTripEvent,
} from './trips';

describe('operator trip events', () => {
  it('only uses transitions the state machine grants to the operator', () => {
    for (const { from, to } of Object.values(OPERATOR_TRIP_EVENTS)) {
      expect(canTransition('trip', from, to, 'operator')).toBe(true);
    }
  });

  it('covers every operator transition exactly once', () => {
    const fromEvents = Object.values(OPERATOR_TRIP_EVENTS).map(({ from, to }) => `${from}>${to}`);
    const fromMachine = TRIP_STATUSES.flatMap((from) =>
      nextStatuses('trip', from, 'operator').map((to) => `${from}>${to}`),
    );
    expect(fromEvents.sort()).toEqual(fromMachine.sort());
  });

  it('are timeline event types', () => {
    for (const event of Object.keys(OPERATOR_TRIP_EVENTS)) {
      expect(TRIP_EVENT_TYPES).toContain(event);
    }
  });

  it('walks the trip from assignment to delivery', () => {
    const walked: OperatorTripEvent[] = [];
    let status: TripStatus = 'assigned';
    for (let event = nextOperatorEvent(status); event; event = nextOperatorEvent(status)) {
      walked.push(event);
      status = OPERATOR_TRIP_EVENTS[event].to;
    }
    expect(walked).toEqual([
      'departed',
      'arrived_at_pickup',
      'loading_started',
      'loading_finished',
      'arrived_at_delivery',
      'unloading_started',
      'unloading_finished',
    ]);
    expect(status).toBe('delivered');
  });

  it('has no next event outside the operator flow', () => {
    for (const status of ['pending_assignment', 'delivered', 'closed', 'cancelled'] as const) {
      expect(nextOperatorEvent(status)).toBeNull();
    }
  });

  it('asks for the estimated end only when unloading starts', () => {
    expect(TRIP_EVENT_TYPES.filter(requiresUnloadEstimate)).toEqual(['unloading_started']);
  });
});

describe('active trips and location sharing', () => {
  it('tracks only while the unit is on the road', () => {
    expect(TRIP_STATUSES.filter(isTripActive)).toEqual([...ACTIVE_TRIP_STATUSES]);
    for (const status of [
      'pending_assignment',
      'assigned',
      'delivered',
      'closed',
      'cancelled',
    ] as const) {
      expect(shouldTrackLocation(status)).toBe(false);
    }
    expect(shouldTrackLocation('in_transit')).toBe(true);
  });
});
