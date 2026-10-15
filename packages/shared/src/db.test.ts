import { describe, expect, expectTypeOf, it } from 'vitest';

import { Constants } from './db';
import type { Database, Enums, Tables } from './index';

// Guards the generated types (pnpm db:types) against drifting from the
// identity schema of B01 (supabase/migrations/*_identity.sql).
describe('generated database types (B01)', () => {
  it('exposes the identity enums', () => {
    expect(Constants.public.Enums.company_type).toEqual(['shipper', 'carrier']);
    expect(Constants.public.Enums.user_role).toEqual(['shipper', 'carrier', 'operator', 'admin']);
    expect(Constants.public.Enums.verification_status).toEqual([
      'pending_review',
      'approved',
      'rejected',
      'expired',
      'suspended',
    ]);
  });

  it('types companies and profiles rows', () => {
    expectTypeOf<Tables<'profiles'>['role']>().toEqualTypeOf<Enums<'user_role'>>();
    expectTypeOf<Tables<'profiles'>['company_id']>().toEqualTypeOf<string | null>();
    expectTypeOf<Tables<'companies'>['status']>().toEqualTypeOf<Enums<'verification_status'>>();
    expectTypeOf<
      Database['public']['Functions']['create_company']['Returns']
    >().toEqualTypeOf<string>();
  });
});

// Fleet schema of B04 (supabase/migrations/*_fleet.sql). The identifiers must
// match the catalogs of packages/shared (B02).
describe('generated database types (B04)', () => {
  it('exposes the fleet enums', () => {
    expect(Constants.public.Enums.vehicle_kind).toEqual(['tractor', 'rigid', 'trailer']);
    expect(Constants.public.Enums.license_type).toEqual(['B', 'C', 'E']);
    expect(Constants.public.Enums.availability_source).toEqual(['manual', 'trip_estimate']);
    expect(Constants.public.Enums.unit_type).toHaveLength(12);
    expect(Constants.public.Enums.special_requirement).toHaveLength(9);
  });

  it('types the fleet rows and RPCs', () => {
    expectTypeOf<Tables<'vehicles'>['company_id']>().toEqualTypeOf<string>();
    expectTypeOf<Tables<'vehicles'>['unit_type']>().toEqualTypeOf<Enums<'unit_type'> | null>();
    expectTypeOf<Tables<'vehicles'>['features']>().toEqualTypeOf<Enums<'special_requirement'>[]>();
    expectTypeOf<Tables<'operators'>['profile_id']>().toEqualTypeOf<string | null>();
    expectTypeOf<
      Database['public']['Functions']['accept_operator_invitation']['Returns']
    >().toEqualTypeOf<string>();
  });
});
