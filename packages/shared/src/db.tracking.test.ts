import { describe, expectTypeOf, it } from 'vitest';

import type { Database, Tables } from './index';

type Functions = Database['public']['Functions'];

// Guards the generated types (pnpm db:types) against drifting from the
// location consent schema of B22 (supabase/migrations/*_location_consents.sql).
describe('generated database types (B22)', () => {
  it('types location_consents', () => {
    expectTypeOf<Tables<'location_consents'>['policy_version']>().toEqualTypeOf<string>();
    expectTypeOf<Tables<'location_consents'>['revoked_at']>().toEqualTypeOf<string | null>();
  });

  it('types the consent RPCs', () => {
    expectTypeOf<Functions['record_location_consent']['Args']>().toEqualTypeOf<{
      p_platform: string;
      p_policy_version: string;
    }>();
    expectTypeOf<Functions['record_location_consent']['Returns']>().toEqualTypeOf<string>();
    expectTypeOf<Functions['revoke_location_consent']['Returns']>().toEqualTypeOf<number>();
    expectTypeOf<Functions['has_location_consent']['Returns']>().toEqualTypeOf<boolean>();
  });
});
