'use server';

import {
  adminBillingCopy,
  authErrors,
  BILLING_SETTING_KEYS,
  billingFunctionErrorText,
  parsePesosToCents,
  uuidField,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { FormState } from '../forms';
import { paths } from '../routing';
import { createClient } from '../supabase/server';

// Server actions of the subscription (H3). Checkout and the Portal are opened
// by the Edge Functions billing-checkout and billing-portal with the user's
// session: they check the Gerente in Postgres and answer with a Stripe URL,
// which the browser follows. The admin actions are RPCs that check the admin
// and validate each value (…_billing.sql); every change is audited.

const notConfigured: FormState = { error: authErrors.notConfigured };
const a = adminBillingCopy;

/** The Spanish text for an Edge Function error (its JSON `code`). */
async function functionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const body = (await context.json().catch(() => ({}))) as { code?: unknown };
    return billingFunctionErrorText(body.code);
  }
  return billingFunctionErrorText(null);
}

async function openStripe(name: 'billing-checkout' | 'billing-portal', body: object) {
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.functions.invoke<{ url?: unknown }>(name, { body });
  const url = typeof data?.url === 'string' ? data.url : null;
  // Only Stripe's own pages: the answer is never followed anywhere else.
  if (error || !url || !/^https:\/\/([a-z0-9-]+\.)*stripe\.com\//u.test(url)) {
    return { error: await functionError(error) };
  }
  redirect(url);
}

export async function startCheckoutAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const planCode = String(formData.get('planCode') ?? '');
  if (!/^[a-z0-9_]{3,40}$/u.test(planCode))
    return { error: billingFunctionErrorText('plan_unavailable') };
  return openStripe('billing-checkout', { planCode });
}

export async function openPortalAction(_prev: FormState): Promise<FormState> {
  return openStripe('billing-portal', {});
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

function adminError(error: { code?: string; message?: string | null }): FormState {
  if (error.code === '42501') return { error: a.errors.notAdmin };
  if (error.code === '22023' || error.code === '23514' || error.code === '23505') {
    return { error: a.errors.invalid };
  }
  return { error: a.errors.generic };
}

async function setSetting(key: string, value: unknown): Promise<FormState> {
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('admin_set_platform_setting', {
    p_key: key,
    p_value: value as never,
  });
  if (error) return adminError(error);
  // The banners of every carrier screen change too.
  revalidatePath('/', 'layout');
  return { message: a.saved };
}

export async function setPilotModeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const value = formData.get('pilotMode');
  if (value !== 'true' && value !== 'false') return { error: a.errors.invalid };
  return setSetting(BILLING_SETTING_KEYS.pilotMode, value === 'true');
}

/** The end of the pilot: a date (end of that day in Mexico City), or none. */
export async function setPilotEndAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (formData.get('clear') === 'on') return setSetting(BILLING_SETTING_KEYS.pilotEndsAt, null);
  const date = String(formData.get('pilotEndsAt') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return { error: a.errors.invalid };
  const endsAt = new Date(`${date}T23:59:59-06:00`);
  if (Number.isNaN(endsAt.getTime())) return { error: a.errors.invalid };
  return setSetting(BILLING_SETTING_KEYS.pilotEndsAt, endsAt.toISOString());
}

export async function setEnforcementAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const value = formData.get('enforcement');
  if (value !== 'off' && value !== 'notice' && value !== 'block')
    return { error: a.errors.invalid };
  return setSetting(BILLING_SETTING_KEYS.enforcement, value);
}

export async function updatePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const planId = uuidField.safeParse(formData.get('planId'));
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '');
  const price = String(formData.get('price') ?? '').trim();
  const stripePriceId = String(formData.get('stripePriceId') ?? '').trim();
  const amountCents = price === '' ? null : parsePesosToCents(price);
  if (!planId.success || name === '' || (price !== '' && !amountCents)) {
    return { error: a.errors.invalid };
  }
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('admin_update_subscription_plan', {
    p_plan_id: planId.data,
    p_name: name,
    p_description: description,
    p_amount_cents: amountCents as number,
    p_stripe_price_id: stripePriceId,
    p_active: formData.get('active') === 'on',
  });
  if (error) return adminError(error);
  revalidatePath(paths.adminSubscriptions);
  revalidatePath(paths.carrierSubscription);
  return { message: a.saved };
}
