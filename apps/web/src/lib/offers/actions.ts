'use server';

import { authErrors, offersCopy, uuidField, validationMessages } from '@transport/shared';
import { revalidatePath } from 'next/cache';

import { formEntries, type FormState } from '../forms';
import { paths } from '../routing';
import { createClient } from '../supabase/server';
import { offerErrorMessage } from './errors';
import { parseCounterForm } from './form';

const notConfigured: FormState = { error: authErrors.notConfigured };

/** Offer id from a hidden input; anything malformed is treated as not found. */
function offerIdOf(formData: FormData): string | null {
  const parsed = uuidField.safeParse(formData.get('offerId'));
  return parsed.success ? parsed.data : null;
}

function done(message?: string): FormState {
  // The board, the load status and the notification badge all change.
  revalidatePath(paths.shipper, 'layout');
  return message ? { message } : {};
}

/**
 * Accepts a carrier's pending offer. accept_offer is atomic: it rejects the
 * other pending offers, contracts the load and creates the trip, and checks
 * the side, the statuses and both companies again.
 */
export async function acceptOffer(_prev: FormState, formData: FormData): Promise<FormState> {
  const offerId = offerIdOf(formData);
  if (!offerId) return { error: offersCopy.errors.notFound };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('accept_offer', { p_offer_id: offerId });
  if (error) return { error: offerErrorMessage(error) };
  return done(offersCopy.actions.accepted);
}

/** Answers a carrier's pending offer with a new amount (counter_offer). */
export async function counterOffer(_prev: FormState, formData: FormData): Promise<FormState> {
  const offerId = offerIdOf(formData);
  if (!offerId) return { error: offersCopy.errors.notFound };
  const entries = formEntries(formData);
  const parsed = parseCounterForm(entries);
  if (!parsed.success) return parsed.state;
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('counter_offer', {
    p_offer_id: offerId,
    p_amount_cents: parsed.data.amountCents,
    p_conditions: parsed.data.conditions,
  });
  if (error) return { error: offerErrorMessage(error), values: { amount: entries.amount ?? '' } };
  return done();
}

/** Rejects a carrier's pending offer, with an optional reason. */
export async function rejectOffer(_prev: FormState, formData: FormData): Promise<FormState> {
  const offerId = offerIdOf(formData);
  if (!offerId) return { error: offersCopy.errors.notFound };
  const reason = formData.get('reason');
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length > 1000) return { fieldErrors: { reason: validationMessages.tooLong(1000) } };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('reject_offer', {
    p_offer_id: offerId,
    p_reason: text || undefined,
  });
  if (error) return { error: offerErrorMessage(error) };
  return done();
}
