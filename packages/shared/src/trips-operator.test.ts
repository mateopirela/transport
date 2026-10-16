import { describe, expect, it } from 'vitest';

import type { TripStatus } from './enums';
import { unloadEstimateFormSchema } from './schemas/trip';
import {
  OPERATOR_TRIP_EVENTS,
  OPERATOR_TRIP_STEPS,
  pickOperatorTrip,
  statusAfterEvents,
  unloadEstimateProblem,
} from './trips';

describe('operator steps (B21)', () => {
  it('lists every operator event once, each starting where the previous one ends', () => {
    expect(OPERATOR_TRIP_STEPS).toEqual(Object.keys(OPERATOR_TRIP_EVENTS));
    OPERATOR_TRIP_STEPS.slice(1).forEach((event, i) => {
      const previous = OPERATOR_TRIP_STEPS[i];
      expect(previous && OPERATOR_TRIP_EVENTS[event].from).toBe(
        previous && OPERATOR_TRIP_EVENTS[previous].to,
      );
    });
  });

  it('applies events in order', () => {
    expect(statusAfterEvents('assigned', [])).toBe('assigned');
    expect(statusAfterEvents('assigned', ['departed', 'arrived_at_pickup'])).toBe('at_pickup');
    expect(statusAfterEvents('assigned', OPERATOR_TRIP_STEPS)).toBe('delivered');
  });

  it('refuses skipped, repeated or out-of-order steps', () => {
    expect(statusAfterEvents('assigned', ['arrived_at_pickup'])).toBeNull();
    expect(statusAfterEvents('assigned', ['departed', 'departed'])).toBeNull();
    expect(statusAfterEvents('in_transit', ['loading_finished'])).toBeNull();
    expect(statusAfterEvents('cancelled', ['departed'])).toBeNull();
    expect(statusAfterEvents('delivered', ['unloading_finished'])).toBeNull();
  });
});

describe('pickOperatorTrip', () => {
  const trip = (id: string, status: TripStatus, pickupAt: string) => ({ id, status, pickupAt });

  it('returns null without trips in the operator hands', () => {
    expect(pickOperatorTrip([])).toBeNull();
    expect(
      pickOperatorTrip([
        trip('a', 'closed', '2026-10-01T10:00:00Z'),
        trip('b', 'cancelled', '2026-10-02T10:00:00Z'),
        trip('c', 'pending_assignment', '2026-10-03T10:00:00Z'),
      ]),
    ).toBeNull();
  });

  it('prefers the trip on the road over assigned and delivered ones', () => {
    expect(
      pickOperatorTrip([
        trip('assigned', 'assigned', '2026-10-01T10:00:00Z'),
        trip('road', 'in_transit', '2026-10-05T10:00:00Z'),
        trip('delivered', 'delivered', '2026-09-30T10:00:00Z'),
      ])?.id,
    ).toBe('road');
  });

  it('takes the earliest assigned trip, else the latest delivered', () => {
    expect(
      pickOperatorTrip([
        trip('later', 'assigned', '2026-10-09T10:00:00Z'),
        trip('sooner', 'assigned', '2026-10-02T10:00:00Z'),
        trip('delivered', 'delivered', '2026-10-01T10:00:00Z'),
      ])?.id,
    ).toBe('sooner');
    expect(
      pickOperatorTrip([
        trip('old', 'delivered', '2026-09-01T10:00:00Z'),
        trip('recent', 'delivered', '2026-10-01T10:00:00Z'),
      ])?.id,
    ).toBe('recent');
  });
});

describe('unload estimate', () => {
  const at = new Date('2026-10-15T12:00:00Z');
  const hours = (h: number) => new Date(at.getTime() + h * 60 * 60 * 1000);

  it('accepts from now up to 30 days later', () => {
    expect(unloadEstimateProblem(at, at)).toBeNull();
    expect(unloadEstimateProblem(hours(6), at)).toBeNull();
    expect(unloadEstimateProblem(hours(30 * 24), at)).toBeNull();
  });

  it('refuses the past and more than 30 days', () => {
    expect(unloadEstimateProblem(hours(-1), at)).toBe('beforeNow');
    expect(unloadEstimateProblem(hours(30 * 24 + 1), at)).toBe('tooFar');
  });

  it('parses a date and time in Mexico City', () => {
    expect(unloadEstimateFormSchema.parse({ date: '2026-10-16', time: '08:30' })).toEqual({
      estimatedEndAt: '2026-10-16T08:30:00-06:00',
    });
    expect(unloadEstimateFormSchema.safeParse({ date: '2026-02-30', time: '08:30' }).success).toBe(
      false,
    );
    expect(unloadEstimateFormSchema.safeParse({ date: '2026-10-16', time: '25:00' }).success).toBe(
      false,
    );
  });
});
