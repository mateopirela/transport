'use server';

import {
  authErrors,
  clientTripsCopy,
  incidentFormSchema,
  uuidField,
  validationMessages,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';

import { formEntries, invalidForm, type FormState } from '../forms';
import { paths } from '../routing';
import { createClient } from '../supabase/server';
import { tripErrorMessage } from './errors';

const notConfigured: FormState = { error: authErrors.notConfigured };

/** Trip id from a hidden input; anything malformed is treated as not found. */
function tripIdOf(formData: FormData): string | null {
  const parsed = uuidField.safeParse(formData.get('tripId'));
  return parsed.success ? parsed.data : null;
}

function done(message: string): FormState {
  // The trip, its load and the notification badge all change.
  revalidatePath(paths.shipper, 'layout');
  return { message };
}

/**
 * Confirms the delivery of a delivered trip (confirm_delivery closes it and
 * completes the load). The RPC checks the company and the status again.
 */
export async function confirmDelivery(_prev: FormState, formData: FormData): Promise<FormState> {
  const tripId = tripIdOf(formData);
  if (!tripId) return { error: clientTripsCopy.errors.notFound };
  const notes = formData.get('notes');
  const text = typeof notes === 'string' ? notes.trim() : '';
  if (text.length > 1000) return { fieldErrors: { notes: validationMessages.tooLong(1000) } };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('confirm_delivery', {
    p_trip_id: tripId,
    p_notes: text || undefined,
  });
  if (error) return { error: tripErrorMessage(error) };
  return done(clientTripsCopy.delivery.confirmed);
}

/** Reports an incident on the trip (report_incident; it joins the timeline). */
export async function reportIncident(_prev: FormState, formData: FormData): Promise<FormState> {
  const tripId = tripIdOf(formData);
  if (!tripId) return { error: clientTripsCopy.errors.notFound };
  const entries = formEntries(formData);
  const parsed = incidentFormSchema.safeParse({
    kind: entries.kind,
    description: entries.description,
  });
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('report_incident', {
    p_trip_id: tripId,
    p_kind: parsed.data.kind,
    p_description: parsed.data.description,
  });
  if (error) {
    return {
      error: tripErrorMessage(error),
      values: { kind: parsed.data.kind, description: parsed.data.description },
    };
  }
  return done(clientTripsCopy.incidents.sent);
}
