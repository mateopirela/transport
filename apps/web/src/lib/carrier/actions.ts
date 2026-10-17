'use server';

import {
  authErrors,
  carrierLoadsCopy,
  carrierOfferErrorText,
  carrierWebCopy,
  uuidField,
  validationMessages,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { formEntries, refillValues, type FormState } from '../forms';
import { paths, safeNextPath } from '../routing';
import { createClient } from '../supabase/server';
import { BUSINESS_UNIT_COOKIE, parseBusinessUnitChoice } from './business-units';
import { parseCarrierOfferForm } from './offer-form';

// Server actions of the carrier web (G10a). Every offer changes only through
// the negotiation RPCs (B05, G1a), which validate the actor, the business
// unit and the state again; the actions only shape the form and the errors.

const notConfigured: FormState = { error: authErrors.notConfigured };

/** Six months: the picker is a preference, not a session. */
const BUSINESS_UNIT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/** A uuid from a hidden input; anything malformed is treated as not found. */
function uuidOf(formData: FormData, name: string): string | null {
  const parsed = uuidField.safeParse(formData.get(name));
  return parsed.success ? parsed.data : null;
}

/** Spanish message for an error of a negotiation RPC (fixed English messages). */
function offerError(error: { message?: string | null } | null): string {
  return carrierOfferErrorText(error?.message ?? '') ?? carrierLoadsCopy.errors.generic;
}

function done(message?: string): FormState {
  // The negotiation, the load status, the lists and the badge all change.
  revalidatePath(paths.carrier, 'layout');
  return message ? { message } : {};
}

/**
 * Remembers the business unit chosen in the picker (`all` or an id) and goes
 * back to the screen it was changed from. The layout resolves the value
 * against the units the viewer operates, so a stale id is harmless.
 */
export async function selectBusinessUnit(formData: FormData): Promise<void> {
  const choice = parseBusinessUnitChoice(formData.get('unidad'));
  const back = safeNextPath(formData.get('volver')?.toString()) ?? paths.carrier;
  if (choice) {
    const store = await cookies();
    store.set(BUSINESS_UNIT_COOKIE, choice, {
      httpOnly: true,
      sameSite: 'lax',
      path: paths.carrier,
      maxAge: BUSINESS_UNIT_COOKIE_MAX_AGE,
    });
  }
  revalidatePath(paths.carrier, 'layout');
  redirect(back);
}

/**
 * First offer on a load, or a new one after the previous chain closed
 * (make_offer). With a unit, the RPC takes the unit's business unit; without
 * one, the chosen business unit or the only one the caller operates.
 */
export async function makeCarrierOffer(_prev: FormState, formData: FormData): Promise<FormState> {
  const loadId = uuidOf(formData, 'loadId');
  if (!loadId) return { error: carrierLoadsCopy.errors.loadGone };
  const entries = formEntries(formData);
  const parsed = parseCarrierOfferForm(entries);
  if (!parsed.success) return parsed.state;
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('make_offer', {
    p_load_id: loadId,
    p_amount_cents: parsed.data.amountCents,
    p_conditions: parsed.data.conditions,
    p_vehicle_id: parsed.data.vehicleId,
    p_business_unit_id: parsed.data.vehicleId ? undefined : parsed.data.businessUnitId,
  });
  if (error) return { error: offerError(error), values: refillValues(entries) };
  return done(carrierLoadsCopy.actions.sent);
}

/**
 * Offers the shipper's proposed price in one step. The amount is read from
 * the load here, never from the form; the unit and business unit are the
 * defaults the screen chose (nearest compatible unit, selected unit).
 */
export async function acceptProposedPrice(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const loadId = uuidOf(formData, 'loadId');
  if (!loadId) return { error: carrierLoadsCopy.errors.loadGone };
  const vehicleId = uuidOf(formData, 'vehicleId');
  const businessUnitId = uuidOf(formData, 'businessUnitId');
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { data: load, error: loadError } = await supabase
    .from('loads')
    .select('proposed_price_cents')
    .eq('id', loadId)
    .maybeSingle();
  if (loadError || !load) return { error: carrierLoadsCopy.errors.loadGone };
  const { error } = await supabase.rpc('make_offer', {
    p_load_id: loadId,
    p_amount_cents: load.proposed_price_cents,
    p_vehicle_id: vehicleId ?? undefined,
    p_business_unit_id: vehicleId ? undefined : (businessUnitId ?? undefined),
  });
  if (error) return { error: offerError(error) };
  return done(carrierLoadsCopy.actions.sent);
}

/** Answers the shipper's pending counteroffer with a new amount (counter_offer). */
export async function counterShipperOffer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const offerId = uuidOf(formData, 'offerId');
  if (!offerId) return { error: carrierLoadsCopy.errors.notPending };
  const entries = formEntries(formData);
  const parsed = parseCarrierOfferForm(entries);
  if (!parsed.success) return parsed.state;
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('counter_offer', {
    p_offer_id: offerId,
    p_amount_cents: parsed.data.amountCents,
    p_conditions: parsed.data.conditions,
    p_vehicle_id: parsed.data.vehicleId,
  });
  if (error) return { error: offerError(error), values: refillValues(entries) };
  return done(carrierLoadsCopy.actions.sent);
}

/**
 * Accepts the shipper's pending counteroffer. accept_offer is atomic: it
 * contracts the load, creates the trip and re-checks both companies.
 */
export async function acceptShipperOffer(_prev: FormState, formData: FormData): Promise<FormState> {
  const offerId = uuidOf(formData, 'offerId');
  if (!offerId) return { error: carrierLoadsCopy.errors.notPending };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('accept_offer', { p_offer_id: offerId });
  if (error) return { error: offerError(error) };
  return done(carrierLoadsCopy.actions.accepted);
}

/** Rejects the shipper's pending counteroffer, with an optional reason. */
export async function rejectShipperOffer(_prev: FormState, formData: FormData): Promise<FormState> {
  const offerId = uuidOf(formData, 'offerId');
  if (!offerId) return { error: carrierLoadsCopy.errors.notPending };
  const reason = formData.get('reason');
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length > 1000) return { fieldErrors: { reason: validationMessages.tooLong(1000) } };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('reject_offer', {
    p_offer_id: offerId,
    p_reason: text || undefined,
  });
  if (error) return { error: offerError(error) };
  return done(carrierWebCopy.offer.rejected);
}

/** Withdraws the company's own pending offer (withdraw_offer). */
export async function withdrawCarrierOffer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const offerId = uuidOf(formData, 'offerId');
  if (!offerId) return { error: carrierLoadsCopy.errors.notPending };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('withdraw_offer', { p_offer_id: offerId });
  if (error) return { error: offerError(error) };
  return done(carrierWebCopy.offer.withdrawn);
}
