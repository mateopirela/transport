import type { Database } from '@transport/shared';

import type { Supabase } from './supabase';

// The subscription of the carrier in the app (H3, D30): information only.
// company_billing_state decides the effective state in Postgres; the app
// never opens Checkout or the Portal nor links to them (App Store 3.1.1 and
// 3.1.3, Google Play's payments policy: docs/tiendas.md).

export type BillingState =
  Database['public']['Functions']['company_billing_state']['Returns'][number];

/** The state of the signed-in staff's company, or null when there is none. */
export async function loadBillingState(client: Supabase): Promise<BillingState | null> {
  const { data, error } = await client.rpc('company_billing_state', {});
  if (error) throw error;
  return data[0] ?? null;
}
