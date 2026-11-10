'use server';

import {
  authErrors,
  FREIGHT_SETTING_KEYS,
  freightAdminErrorText,
  freightCopy,
  isPaymentTermsDays,
  isValidCommissionBps,
  isValidSpeiReference,
  normalizeSpeiReference,
  parsePesosToCents,
  uuidField,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';

import type { FormState } from '../forms';
import { adminCompanyPath, paths } from '../routing';
import { createClient } from '../supabase/server';

// Admin actions of the freight ledger (I3). Each one is an RPC that checks the
// admin and validates its values in Postgres (…_freight_ledger.sql); the
// checks here only give a clearer message first. Every change is audited.

const notConfigured: FormState = { error: authErrors.notConfigured };
const a = freightCopy.admin;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

function refreshLedger() {
  revalidatePath(paths.adminFreight);
  revalidatePath(paths.carrierCollections);
  revalidatePath(paths.shipperPortfolio);
}

/** Records a SPEI payment of a trip (from the client, or to the carrier). */
export async function recordFreightPaymentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tripId = uuidField.safeParse(formData.get('tripId'));
  const direction = formData.get('direction');
  const amountCents = parsePesosToCents(String(formData.get('amount') ?? ''));
  const paidOn = String(formData.get('paidOn') ?? '');
  const reference = normalizeSpeiReference(String(formData.get('speiReference') ?? ''));
  const note = String(formData.get('note') ?? '').trim();
  if (!tripId.success || (direction !== 'client_to_fulmis' && direction !== 'fulmis_to_carrier')) {
    return { error: a.errors.invalid };
  }
  if (!amountCents) return { error: a.errors.amount };
  if (!DATE.test(paidOn)) return { error: a.errors.date };
  if (!isValidSpeiReference(reference)) return { error: a.errors.reference };
  if (note.length > 500) return { error: a.errors.note };

  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('admin_record_freight_payment', {
    p_trip_id: tripId.data,
    p_direction: direction,
    p_amount_cents: amountCents,
    p_paid_on: paidOn,
    p_spei_reference: reference,
    ...(note ? { p_note: note } : {}),
  });
  if (error) return { error: freightAdminErrorText(error) };
  refreshLedger();
  return { message: a.saved };
}

/** Marks the manual review of a cancelled trip with payments as resolved. */
export async function resolveFreightReviewAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tripId = uuidField.safeParse(formData.get('tripId'));
  const note = String(formData.get('note') ?? '').trim();
  if (!tripId.success) return { error: a.errors.invalid };
  if (note === '' || note.length > 500) return { error: a.errors.note };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('admin_resolve_freight_review', {
    p_trip_id: tripId.data,
    p_note: note,
  });
  if (error) return { error: freightAdminErrorText(error) };
  refreshLedger();
  return { message: a.reviewResolved };
}

/** The default commission (freight.commission_bps); only new trips take it. */
export async function setCommissionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = String(formData.get('commissionBps') ?? '').trim();
  const bps = /^\d{1,4}$/u.test(raw) ? Number(raw) : null;
  if (!isValidCommissionBps(bps)) return { error: a.errors.invalid };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('admin_set_platform_setting', {
    p_key: FREIGHT_SETTING_KEYS.commissionBps,
    p_value: bps,
  });
  if (error) return { error: freightAdminErrorText(error) };
  revalidatePath(paths.adminFreight);
  return { message: a.commissionSaved };
}

/** A shipper's payment terms (15, 30 or 60 days), or none. */
export async function setCompanyTermsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const companyId = uuidField.safeParse(formData.get('companyId'));
  const raw = String(formData.get('termsDays') ?? '');
  const days = raw === '' ? null : Number(raw);
  if (!companyId.success || (days !== null && !isPaymentTermsDays(days))) {
    return { error: a.errors.invalid };
  }
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('admin_set_company_payment_terms', {
    p_company_id: companyId.data,
    p_days: days as number,
  });
  if (error) return { error: freightAdminErrorText(error) };
  revalidatePath(adminCompanyPath(companyId.data));
  refreshLedger();
  return { message: a.companySaved };
}

/** A carrier's commission override, or none (the general one). */
export async function setCompanyCommissionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const companyId = uuidField.safeParse(formData.get('companyId'));
  const raw = String(formData.get('commissionBps') ?? '').trim();
  const bps = raw === '' ? null : /^\d{1,4}$/u.test(raw) ? Number(raw) : Number.NaN;
  if (!companyId.success || (bps !== null && !isValidCommissionBps(bps))) {
    return { error: a.errors.invalid };
  }
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('admin_set_company_commission', {
    p_company_id: companyId.data,
    p_bps: bps as number,
  });
  if (error) return { error: freightAdminErrorText(error) };
  revalidatePath(adminCompanyPath(companyId.data));
  return { message: a.companySaved };
}
