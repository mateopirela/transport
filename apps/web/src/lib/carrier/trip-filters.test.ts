import { ACTIVE_TRIP_STATUSES } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import {
  CARRIER_TRIPS_VIEWS,
  parseCarrierTripsView,
  parseTripsBusinessUnit,
  TRIP_VIEW_PARAMS,
  tripsViewStatuses,
} from './trip-filters';

const CORRIDOR = '00000000-0000-4000-8000-000000000001';
const REGIONAL = '00000000-0000-4000-8000-000000000002';

describe('parseCarrierTripsView', () => {
  it('reads each tab from its parameter and defaults to the open trips', () => {
    for (const view of CARRIER_TRIPS_VIEWS) {
      expect(parseCarrierTripsView({ vista: TRIP_VIEW_PARAMS[view] })).toBe(view);
    }
    expect(parseCarrierTripsView({})).toBe('open');
    expect(parseCarrierTripsView({ vista: 'otra' })).toBe('open');
    expect(parseCarrierTripsView({ vista: ['historial', 'x'] })).toBe('history');
  });
});

describe('tripsViewStatuses', () => {
  it('splits the statuses the way the app groups them', () => {
    expect(tripsViewStatuses('to_assign')).toEqual(['pending_assignment']);
    expect(tripsViewStatuses('upcoming')).toEqual(['assigned']);
    expect(tripsViewStatuses('active')).toEqual([...ACTIVE_TRIP_STATUSES]);
    expect(tripsViewStatuses('history')).toEqual(['delivered', 'closed', 'cancelled']);
    expect(tripsViewStatuses('open')).toEqual([
      'pending_assignment',
      'assigned',
      ...ACTIVE_TRIP_STATUSES,
    ]);
  });
});

describe('parseTripsBusinessUnit', () => {
  it('accepts only a business unit the viewer operates', () => {
    expect(parseTripsBusinessUnit({ unidad: CORRIDOR }, [CORRIDOR, REGIONAL])).toBe(CORRIDOR);
    expect(parseTripsBusinessUnit({ unidad: REGIONAL }, [CORRIDOR])).toBeNull();
    expect(parseTripsBusinessUnit({ unidad: '../admin' }, [CORRIDOR])).toBeNull();
    expect(parseTripsBusinessUnit({}, [CORRIDOR])).toBeNull();
  });
});
