import 'server-only';

import { parseBillingSettings, type BillingSettings, type Database } from '@transport/shared';

import type { Supabase } from '../viewer';

// Reads of the subscription (H3). company_billing_state decides the effective
// state in Postgres (the pilot flag, the notice, whether Checkout is
// available); the plans and settings are readable by every signed-in user and
// the companies' subscriptions by their staff and admins (RLS).

export type BillingState =
  Database['public']['Functions']['company_billing_state']['Returns'][number];
export type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row'];

/** The caller's company state (Gerente or Coordinador), or any company's for admins. */
export async function loadBillingState(
  supabase: Supabase,
  companyId?: string,
): Promise<BillingState | null> {
  const { data, error } = await supabase.rpc(
    'company_billing_state',
    companyId ? { p_company_id: companyId } : {},
  );
  if (error) throw new Error(`company_billing_state failed: ${error.message}`);
  return data[0] ?? null;
}

/** The plans the caller sees (the active ones; admins also the inactive). */
export async function loadPlans(supabase: Supabase): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('sort_order')
    .order('code');
  if (error) throw new Error(`subscription_plans query failed: ${error.message}`);
  return data;
}

export async function loadBillingSettings(supabase: Supabase): Promise<BillingSettings> {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value')
    .like('key', 'billing.%');
  if (error) throw new Error(`platform_settings query failed: ${error.message}`);
  return parseBillingSettings(data);
}

export interface CompanySubscriptionRow {
  companyId: string;
  legalName: string;
  isOwnerOperator: boolean;
  status: Database['public']['Enums']['subscription_status'];
  planName: string | null;
  currentPeriodEnd: string | null;
}

/** Admin: every carrier company with its stored subscription. */
export async function loadCompanySubscriptions(
  supabase: Supabase,
): Promise<CompanySubscriptionRow[]> {
  const { data, error } = await supabase
    .from('company_subscriptions')
    .select(
      'company_id, status, current_period_end, companies!inner(legal_name, is_owner_operator), subscription_plans(name)',
    )
    .order('created_at');
  if (error) throw new Error(`company_subscriptions query failed: ${error.message}`);
  return data
    .map((row) => ({
      companyId: row.company_id,
      legalName: row.companies.legal_name,
      isOwnerOperator: row.companies.is_owner_operator,
      status: row.status,
      planName: row.subscription_plans?.name ?? null,
      currentPeriodEnd: row.current_period_end,
    }))
    .sort((a, b) => a.legalName.localeCompare(b.legalName, 'es'));
}
