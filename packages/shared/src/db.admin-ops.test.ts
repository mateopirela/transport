import { describe, expectTypeOf, it } from 'vitest';

import type { Database } from './index';
import type { PilotKpiSummary } from './kpis';

type Functions = Database['public']['Functions'];
type Views = Database['public']['Views'];

// Guards the generated types (pnpm db:types) against drifting from the admin
// operations schema of B16 (supabase/migrations/*_admin_operations.sql).
describe('generated database types (B16)', () => {
  it('types the manual contracting RPCs', () => {
    expectTypeOf<Functions['admin_create_offer']['Returns']>().toEqualTypeOf<string>();
    expectTypeOf<Functions['admin_create_offer']['Args']['p_accept']>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<Functions['admin_accept_offer']['Returns']>().toEqualTypeOf<string>();
  });

  it('keeps PilotKpiSummary in sync with kpi_pilot_summary', () => {
    expectTypeOf<Views['kpi_pilot_summary']['Row']>().toEqualTypeOf<PilotKpiSummary>();
  });
});
