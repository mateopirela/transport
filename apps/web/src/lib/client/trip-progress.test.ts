import { TRIP_STATUSES, type TripStatus } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { tripProgress, tripProgressStep } from './trip-progress';

const states = (status: TripStatus) => tripProgress(status).map((step) => step.state);

describe('tripProgressStep', () => {
  it('puts every status in a step, or in none once the trip ended', () => {
    for (const status of TRIP_STATUSES) {
      const step = tripProgressStep(status);
      if (status === 'delivered' || status === 'closed' || status === 'cancelled') {
        expect(step).toBeNull();
      } else {
        expect(step).not.toBeNull();
      }
    }
  });

  it('groups the statuses of each place', () => {
    expect(tripProgressStep('assigned')).toBe('assignment');
    expect(tripProgressStep('loading')).toBe('pickup');
    expect(tripProgressStep('in_transit')).toBe('transit');
    expect(tripProgressStep('unloading')).toBe('delivery');
  });
});

describe('tripProgress', () => {
  it('has four steps, with their words', () => {
    const steps = tripProgress('in_transit');
    expect(steps.map((step) => step.label)).toEqual([
      'Asignación',
      'Recolección',
      'En tránsito',
      'Entrega',
    ]);
  });

  it('marks the steps before the current one as done', () => {
    expect(states('pending_assignment')).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
    expect(states('at_pickup')).toEqual(['done', 'current', 'upcoming', 'upcoming']);
    expect(states('in_transit')).toEqual(['done', 'done', 'current', 'upcoming']);
    expect(states('at_delivery')).toEqual(['done', 'done', 'done', 'current']);
  });

  it('has every step done once delivered or closed', () => {
    expect(states('delivered')).toEqual(['done', 'done', 'done', 'done']);
    expect(states('closed')).toEqual(['done', 'done', 'done', 'done']);
  });

  it('has no step done when the trip was cancelled', () => {
    expect(states('cancelled')).toEqual(['upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('has exactly one current step while the trip runs', () => {
    for (const status of TRIP_STATUSES) {
      const current = states(status).filter((state) => state === 'current').length;
      expect(current).toBe(tripProgressStep(status) === null ? 0 : 1);
    }
  });
});
