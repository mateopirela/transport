import { describe, expect, expectTypeOf, it } from 'vitest';

import { Constants } from './db';
import { TRIP_STATUSES } from './enums';
import type { Database, Enums, Tables } from './index';
import { ACTIVE_TRIP_STATUSES, OPERATOR_TRIP_EVENTS } from './trips';

type Functions = Database['public']['Functions'];

// Guards the generated types (pnpm db:types) against drifting from the trips
// schema of B06 (supabase/migrations/*_trips.sql).
describe('generated database types (B06)', () => {
  it('keeps the trip helpers on statuses of the SQL enum', () => {
    expect(Constants.public.Enums.trip_status).toEqual([...TRIP_STATUSES]);
    for (const { from, to } of Object.values(OPERATOR_TRIP_EVENTS)) {
      expect(TRIP_STATUSES).toContain(from);
      expect(TRIP_STATUSES).toContain(to);
    }
    for (const status of ACTIVE_TRIP_STATUSES) expect(TRIP_STATUSES).toContain(status);
  });

  it('types trips, events, locations, evidence and incidents', () => {
    expectTypeOf<Tables<'trips'>['status']>().toEqualTypeOf<Enums<'trip_status'>>();
    expectTypeOf<Tables<'trips'>['operator_id']>().toEqualTypeOf<string | null>();
    expectTypeOf<Tables<'trip_events'>['event_type']>().toEqualTypeOf<Enums<'trip_event_type'>>();
    expectTypeOf<Tables<'trip_events'>['estimated_unload_end_at']>().toEqualTypeOf<string | null>();
    expectTypeOf<Tables<'trip_locations'>['recorded_at']>().toEqualTypeOf<string>();
    expectTypeOf<Tables<'trip_evidence'>['stage']>().toEqualTypeOf<Enums<'evidence_stage'>>();
    expectTypeOf<Tables<'incidents'>['kind']>().toEqualTypeOf<Enums<'incident_kind'>>();
  });

  it('types the trip RPCs', () => {
    expectTypeOf<Functions['record_trip_event']['Returns']>().toEqualTypeOf<string>();
    expectTypeOf<Functions['record_trip_locations']['Returns']>().toEqualTypeOf<number>();
    expectTypeOf<Functions['assign_trip']['Args']['p_operator_id']>().toEqualTypeOf<string>();
    expectTypeOf<Functions['report_incident']['Returns']>().toEqualTypeOf<string>();
  });
});
