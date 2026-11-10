'use server';

import {
  authErrors,
  brokeredCopy,
  brokeredQuoteProblem,
  parsePesosToCents,
  uuidField,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';

import type { FormState } from '../forms';
import { adminBrokeredPath, paths } from '../routing';
import { createClient } from '../supabase/server';
import { brokeredAdminErrorMessage } from './errors';

// Admin actions of the brokered loads (I6, D39). Each one is an RPC that
// checks the admin and the prices in Postgres (…_brokered_loads.sql); the
// checks here only give a clearer message first. Every change is audited.

const notConfigured: FormState = { error: authErrors.notConfigured };
const e = brokeredCopy.errors;

function refresh(loadId: string) {
  revalidatePath(paths.adminBrokered);
  revalidatePath(adminBrokeredPath(loadId));
}

function pesos(formData: FormData, name: string): number | null {
  const text = String(formData.get(name) ?? '').trim();
  return text === '' ? null : parsePesosToCents(text);
}

/**
 * Sets the client's price and the carriers' rate of a brokered load. Before
 * the client approves, both change (and the client is told); after, only the
 * rate.
 */
export async function quoteBrokeredLoadAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const loadId = uuidField.safeParse(formData.get('loadId'));
  if (!loadId.success) return { error: e.generic };
  const clientPrice = pesos(formData, 'clientPrice');
  const carrierPrice = pesos(formData, 'carrierPrice');
  const values = {
    clientPrice: String(formData.get('clientPrice') ?? ''),
    carrierPrice: String(formData.get('carrierPrice') ?? ''),
  };
  const problem = brokeredQuoteProblem(clientPrice, carrierPrice);
  if (problem) return { error: e[problem], values };

  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('admin_quote_brokered_load', {
    p_load_id: loadId.data,
    p_client_price_cents: clientPrice as number,
    p_carrier_price_cents: carrierPrice as number,
  });
  if (error) return { error: brokeredAdminErrorMessage(error), values };
  refresh(loadId.data);
  return { message: brokeredCopy.admin.saved };
}

/**
 * Answers a carrier's offer in the name of Transport (the shipper side of a
 * brokered load): accept, reject, or counter with an amount (never over the
 * client's price, which the RPC checks).
 */
export async function respondBrokeredOfferAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const offerId = uuidField.safeParse(formData.get('offerId'));
  const loadId = uuidField.safeParse(formData.get('loadId'));
  const intent = formData.get('intent');
  if (!offerId.success || !loadId.success) return { error: e.generic };
  const supabase = await createClient();
  if (!supabase) return notConfigured;

  let error;
  if (intent === 'accept') {
    ({ error } = await supabase.rpc('accept_offer', { p_offer_id: offerId.data }));
  } else if (intent === 'reject') {
    ({ error } = await supabase.rpc('reject_offer', { p_offer_id: offerId.data }));
  } else if (intent === 'counter') {
    const amount = pesos(formData, 'amount');
    if (!amount || brokeredQuoteProblem(amount, amount)) {
      return { error: e.amount, values: { amount: String(formData.get('amount') ?? '') } };
    }
    ({ error } = await supabase.rpc('counter_offer', {
      p_offer_id: offerId.data,
      p_amount_cents: amount,
    }));
  } else {
    return { error: e.generic };
  }
  if (error) return { error: brokeredAdminErrorMessage(error) };
  refresh(loadId.data);
  revalidatePath(paths.adminFreight);
  return {};
}
