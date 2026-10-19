import { describe, expect, expectTypeOf, it } from 'vitest';

import { Constants } from './db';
import { LICENSE_TYPES, SPECIAL_REQUIREMENTS, UNIT_TYPES, VEHICLE_KINDS } from './enums';
import type { Database, Enums, Tables } from './index';

// Guards the generated types (pnpm db:types) against drifting from the fleet
// schema of B04 (supabase/migrations/*_fleet.sql), and keeps the SQL enums in
// sync with the domain catalogs of B02.
describe('generated database types (B04)', () => {
  it('matches the fleet enums with the domain catalogs', () => {
    expect(Constants.public.Enums.vehicle_kind).toEqual([...VEHICLE_KINDS]);
    expect(Constants.public.Enums.unit_type).toEqual([...UNIT_TYPES]);
    expect(Constants.public.Enums.special_requirement).toEqual([...SPECIAL_REQUIREMENTS]);
    expect(Constants.public.Enums.license_type).toEqual([...LICENSE_TYPES]);
    expect(Constants.public.Enums.availability_source).toEqual(['manual', 'trip_estimate']);
  });

  it('types the fleet rows and RPCs', () => {
    expectTypeOf<Tables<'vehicles'>['company_id']>().toEqualTypeOf<string>();
    expectTypeOf<Tables<'vehicles'>['unit_type']>().toEqualTypeOf<Enums<'unit_type'> | null>();
    expectTypeOf<Tables<'vehicles'>['features']>().toEqualTypeOf<Enums<'special_requirement'>[]>();
    expectTypeOf<Tables<'operators'>['profile_id']>().toEqualTypeOf<string | null>();
    expectTypeOf<
      Database['public']['Functions']['register_company']['Returns']
    >().toEqualTypeOf<string>();
  });
});
