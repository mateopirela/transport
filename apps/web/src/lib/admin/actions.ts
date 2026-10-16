'use server';

import {
  adminContractSchema,
  adminOpsCopy,
  authErrors,
  incidentResolutionSchema,
  parsePesosToCents,
  uuidField,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';

import { formEntries, invalidForm, refillValues, type FormState } from '../forms';
import { paths } from '../routing';
import { createClient } from '../supabase/server';
import { adminOpsErrorMessage } from './errors';

const notConfigured: FormState = { error: authErrors.notConfigured };

function idOf(formData: FormData, name: string): string | null {
  const parsed = uuidField.safeParse(formData.get(name));
  return parsed.success ? parsed.data : null;
}

function done(message: string): FormState {
  // Loads, trips, incidents and the dashboard all change.
  revalidatePath(paths.admin, 'layout');
  return { message };
}

/**
 * Manual contract: an offer in the name of a carrier, optionally accepted at
 * once in the name of the shipper. admin_create_offer checks the admin, the
 * load, both companies and the amount again; everything lands in audit_log.
 */
export async function adminCreateOffer(_prev: FormState, formData: FormData): Promise<FormState> {
  const loadId = idOf(formData, 'loadId');
  if (!loadId) return { error: adminOpsCopy.load.notFound };
  const entries = formEntries(formData);
  // An amount that does not parse is NaN, so the schema reports "monto no válido".
  const amountCents = entries.amount
    ? (parsePesosToCents(entries.amount) ?? Number.NaN)
    : undefined;
  const parsed = adminContractSchema.safeParse({
    carrierCompanyId: entries.carrierCompanyId,
    amountCents,
    conditions: entries.conditions,
    accept: entries.accept === 'on',
  });
  if (!parsed.success) {
    const state = invalidForm(parsed.error, entries);
    // The input is called `amount`, the schema field `amountCents`.
    if (state.fieldErrors?.amountCents) {
      state.fieldErrors.amount = state.fieldErrors.amountCents;
      delete state.fieldErrors.amountCents;
    }
    return state;
  }
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const v = parsed.data;
  const { error } = await supabase.rpc('admin_create_offer', {
    p_load_id: loadId,
    p_carrier_company_id: v.carrierCompanyId,
    p_amount_cents: v.amountCents,
    p_conditions: v.conditions,
    p_accept: v.accept,
  });
  if (error) return { error: adminOpsErrorMessage(error), values: refillValues(entries) };
  return done(v.accept ? adminOpsCopy.contract.contracted : adminOpsCopy.contract.created);
}

/** Accepts a pending offer in the name of its counterparty (admin_accept_offer). */
export async function adminAcceptOffer(_prev: FormState, formData: FormData): Promise<FormState> {
  const offerId = idOf(formData, 'offerId');
  if (!offerId) return { error: adminOpsCopy.errors.notPending };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('admin_accept_offer', { p_offer_id: offerId });
  if (error) return { error: adminOpsErrorMessage(error) };
  return done(adminOpsCopy.load.accepted);
}

/** Resolves an open incident with a resolution note (resolve_incident, B06). */
export async function resolveIncident(_prev: FormState, formData: FormData): Promise<FormState> {
  const incidentId = idOf(formData, 'incidentId');
  if (!incidentId) return { error: adminOpsCopy.errors.generic };
  const entries = formEntries(formData);
  const parsed = incidentResolutionSchema.safeParse({ resolution: entries.resolution });
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('resolve_incident', {
    p_incident_id: incidentId,
    p_resolution: parsed.data.resolution,
  });
  if (error) return { error: adminOpsErrorMessage(error), values: refillValues(entries) };
  return done(adminOpsCopy.incidents.resolved);
}
