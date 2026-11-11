'use server';

import {
  authErrors,
  isQuickPayInvoiceBlocker,
  isValidExposureLimitCents,
  isValidQuickPayFeeBps,
  parsePesosToCents,
  QUICK_PAY_SETTING_KEYS,
  quickPayCopy,
  quickPayErrorText,
  uuidField,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';

import type { FormState } from '../forms';
import { paths } from '../routing';
import { createClient } from '../supabase/server';

// Quick pay (I4, D38). Each action is an RPC that checks who calls it and
// every rule in Postgres (…_quick_pay.sql); the checks here only give a
// clearer message first.

const notConfigured: FormState = { error: authErrors.notConfigured };
const q = quickPayCopy;

function refreshLedger() {
  revalidatePath(paths.adminFreight);
  revalidatePath(paths.carrierCollections);
}

/**
 * The carrier asks for the quick pay of a trip with the fee it was shown: if
 * the fee changed meanwhile, Postgres refuses it and the page shows the new
 * amount.
 */
export async function requestQuickPayAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tripId = uuidField.safeParse(formData.get('tripId'));
  const raw = String(formData.get('feeBps') ?? '');
  const feeBps = /^\d{1,4}$/u.test(raw) ? Number(raw) : null;
  if (!tripId.success || !isValidQuickPayFeeBps(feeBps)) return { error: q.errors.generic };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('request_quick_pay', {
    p_trip_id: tripId.data,
    p_fee_bps: feeBps,
  });
  if (error) {
    // A new fee: the page reloads with it.
    if (error.details === 'fee_changed') revalidatePath(paths.carrierCollections);
    return { error: quickPayErrorText(error) };
  }
  // The page comes back with the request in place of the form.
  refreshLedger();
  return {};
}

/** The admin approves a request; over the exposure limit only when confirmed. */
export async function approveQuickPayAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tripId = uuidField.safeParse(formData.get('tripId'));
  if (!tripId.success) return { error: q.errors.generic };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('admin_approve_quick_pay', {
    p_trip_id: tripId.data,
    p_confirm_over_limit: formData.get('confirmOverLimit') === 'on',
  });
  if (error) {
    // Over the limit meanwhile (another approval): the page comes back with
    // the new exposure and the form asks for the confirmation.
    if (error.details === 'over_limit') {
      revalidatePath(paths.adminFreight);
      return { error: quickPayErrorText(error, 'admin'), values: { overLimit: '1' } };
    }
    // The carrier's CFDI is not validated (I4): the page comes back saying why.
    if (isQuickPayInvoiceBlocker(error.details)) revalidatePath(paths.adminFreight);
    return { error: quickPayErrorText(error, 'admin') };
  }
  refreshLedger();
  return { message: q.admin.approvedDone };
}

/** The admin rejects a request, with the reason the carrier sees. */
export async function rejectQuickPayAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tripId = uuidField.safeParse(formData.get('tripId'));
  const reason = String(formData.get('reason') ?? '').trim();
  if (!tripId.success) return { error: q.errors.generic };
  if (reason === '' || reason.length > 500) return { error: q.errors.reason };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('admin_reject_quick_pay', {
    p_trip_id: tripId.data,
    p_reason: reason,
  });
  if (error) return { error: quickPayErrorText(error, 'admin') };
  refreshLedger();
  return { message: q.admin.rejectedDone };
}

/** The fee (basis points) and the exposure limit (pesos, empty: none). */
export async function setQuickPaySettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const rawFee = String(formData.get('feeBps') ?? '').trim();
  const feeBps = /^\d{1,4}$/u.test(rawFee) ? Number(rawFee) : null;
  if (!isValidQuickPayFeeBps(feeBps)) return { error: q.errors.fee };
  const rawLimit = String(formData.get('limit') ?? '').trim();
  const limitCents = rawLimit === '' ? null : parsePesosToCents(rawLimit);
  if ((rawLimit !== '' && limitCents === null) || !isValidExposureLimitCents(limitCents)) {
    return { error: q.errors.limit };
  }
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  for (const [key, value] of [
    [QUICK_PAY_SETTING_KEYS.feeBps, feeBps],
    [QUICK_PAY_SETTING_KEYS.exposureLimitCents, limitCents],
  ] as const) {
    const { error } = await supabase.rpc('admin_set_platform_setting', {
      p_key: key,
      p_value: value,
    });
    if (error) return { error: error.code === '42501' ? q.errors.notAllowed : q.errors.generic };
  }
  revalidatePath(paths.adminFreight);
  return { message: q.admin.settingsSaved };
}
