import {
  OPERATOR_TRIP_EVENTS,
  OPERATOR_TRIP_STEPS,
  operatorNextStepCopy,
  operatorStepActionLabels,
  TRIP_STATUSES,
} from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { nextStep, stepDetails, TRIP_STEP_COUNT } from './next-step';

describe('nextStep', () => {
  it('names the step of every status the operator moves, with its button', () => {
    for (const event of OPERATOR_TRIP_STEPS) {
      const step = nextStep(OPERATOR_TRIP_EVENTS[event].from);
      expect(step.event).toBe(event);
      expect(step.title).toBe(operatorNextStepCopy.titles[event]);
      expect(step.action).toBe(operatorStepActionLabels[event]);
    }
  });

  it('never titles a step with the words of its button (the flows tap the button by them)', () => {
    for (const event of OPERATOR_TRIP_STEPS) {
      expect(operatorNextStepCopy.titles[event]).not.toBe(operatorStepActionLabels[event]);
    }
  });

  it('has nothing to record once delivered, and says the load was delivered', () => {
    for (const status of ['delivered', 'closed'] as const) {
      expect(nextStep(status)).toEqual({
        event: null,
        title: operatorNextStepCopy.doneTitle,
        action: null,
        place: null,
        directions: null,
        progress: TRIP_STEP_COUNT,
      });
    }
    expect(nextStep('cancelled').title).toBe(operatorNextStepCopy.waitingTitle);
    expect(nextStep('cancelled').action).toBeNull();
  });

  it('places the first four steps at the pickup and the last three at the delivery', () => {
    expect(nextStep('assigned').place).toBe('origin');
    expect(nextStep('loading').place).toBe('origin');
    expect(nextStep('in_transit').place).toBe('destination');
    expect(nextStep('unloading').place).toBe('destination');
  });

  it('drives to the pickup until the unit is there, then to the delivery', () => {
    expect(nextStep('assigned').directions).toBe('origin');
    expect(nextStep('en_route_to_pickup').directions).toBe('origin');
    expect(nextStep('at_pickup').directions).toBe('destination');
    expect(nextStep('in_transit').directions).toBe('destination');
    expect(nextStep('unloading').directions).toBe('destination');
    expect(nextStep('delivered').directions).toBeNull();
  });

  it('counts the four steps of the trip: pickup, loading, on the road, delivery', () => {
    expect(TRIP_STEP_COUNT).toBe(4);
    expect(nextStep('assigned').progress).toBe(0);
    expect(nextStep('en_route_to_pickup').progress).toBe(0);
    expect(nextStep('at_pickup').progress).toBe(1);
    expect(nextStep('loading').progress).toBe(1);
    expect(nextStep('in_transit').progress).toBe(2);
    expect(nextStep('at_delivery').progress).toBe(3);
    expect(nextStep('unloading').progress).toBe(3);
    expect(nextStep('delivered').progress).toBe(4);
  });

  it('never goes back as the trip moves forward', () => {
    let last = -1;
    for (const event of OPERATOR_TRIP_STEPS) {
      const { progress } = nextStep(OPERATOR_TRIP_EVENTS[event].to);
      expect(progress).toBeGreaterThanOrEqual(last);
      last = progress;
    }
  });

  it('answers for every status there is', () => {
    for (const status of TRIP_STATUSES) {
      const step = nextStep(status);
      expect(step.title.trim()).not.toBe('');
      expect(Number.isInteger(step.progress)).toBe(true);
    }
  });
});

describe('stepDetails', () => {
  // 14:10 and 15:25 UTC are 8:10 and 9:25 in Mexico City; "now" is later that day.
  const now = Date.parse('2026-11-11T20:00:00Z');
  const events = [
    { type: 'departed', occurredAt: '2026-11-11T13:30:00Z' },
    { type: 'arrived_at_pickup', occurredAt: '2026-11-11T14:10:00+00:00' },
    { type: 'loading_started', occurredAt: '2026-11-11T14:20:00Z' },
    { type: 'loading_finished', occurredAt: '2026-11-11T15:25:00.000Z' },
  ] as const;

  it('gives a done step the time it ended, "Ahora" to the one in course and nothing ahead', () => {
    expect(stepDetails(2, events, now)).toEqual([
      '8:10',
      '9:25',
      operatorNextStepCopy.now,
      undefined,
    ]);
  });

  it('takes the latest record of a step, whatever way its moment is written', () => {
    const again = [
      ...events,
      { type: 'arrived_at_pickup', occurredAt: '2026-11-11T14:40:00Z' } as const,
    ];
    expect(stepDetails(2, again, now)[0]).toBe('8:40');
  });

  it('leaves a done step without a line when its event is not known', () => {
    expect(stepDetails(4, [], now)).toEqual([undefined, undefined, undefined, undefined]);
    expect(stepDetails(0, [], now)).toEqual([
      operatorNextStepCopy.now,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('gives a step of another day its date instead of its time', () => {
    // 4:10 UTC on the 11th is 22:10 of the 10th in Mexico City.
    const lastNight = [{ type: 'arrived_at_pickup', occurredAt: '2026-11-11T04:10:00Z' }] as const;
    expect(stepDetails(1, lastNight, now)[0]).toBe('10 nov');
    // The same moment, read that night, is still a time.
    expect(stepDetails(1, lastNight, Date.parse('2026-11-11T05:00:00Z'))[0]).toBe('22:10');
    // A year later, on the same day and month, it is a date again.
    expect(stepDetails(1, lastNight, Date.parse('2027-11-11T05:00:00Z'))[0]).toBe('10 nov');
  });
});
