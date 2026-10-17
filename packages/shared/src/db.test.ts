import { describe, expect, expectTypeOf, it } from 'vitest';

import { Constants } from './db';
import type { Database, Enums, Tables } from './index';

// Guards the generated types (pnpm db:types) against drifting from the
// identity schema of B01 (supabase/migrations/*_identity.sql).
describe('generated database types (B01)', () => {
  it('exposes the identity enums', () => {
    expect(Constants.public.Enums.company_type).toEqual(['shipper', 'carrier']);
    expect(Constants.public.Enums.user_role).toEqual([
      'shipper',
      'manager',
      'coordinator',
      'operator',
      'admin',
    ]);
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
