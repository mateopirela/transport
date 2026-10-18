'use server';

import {
  authErrors,
  cancelTripSchema,
  carrierTripErrorText,
  carrierWebCopy,
  incidentFormSchema,
  tripDocumentSchema,
  uuidField,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';

import { formEntries, invalidForm, refillValues, type FormState } from '../forms';
import { paths } from '../routing';
import { createClient } from '../supabase/server';

// Server actions of the carrier's trip screen (G10b). Every change goes
// through a trip RPC (assign_trip, cancel_trip, report_incident,
// add_trip_document), which validates the actor, the business unit (G1a) and
// the status again; the actions only shape the form and the errors.

const c = carrierWebCopy.trips;
const notConfigured: FormState = { error: authErrors.notConfigured };

/** A uuid from a hidden input; anything malformed is treated as not found. */
function uuidOf(formData: FormData, name: string): string | null {
  const parsed = uuidField.safeParse(formData.get(name));
  return parsed.success ? parsed.data : null;
}

/** Spanish message for an error of a trip RPC (fixed English messages). */
function tripError(error: { message?: string | null } | null): string {
  return carrierTripErrorText(error?.message ?? '') ?? c.errors.generic;
}

function done(message: string): FormState {
  // The trip, the lists, the fleet's availability and the badge all change.
  revalidatePath(paths.carrier, 'layout');
  return { message };
}

/**
 * Idempotency key of the submission attempt, from a hidden input. A missing or
 * malformed key only loses the deduplication, so it is dropped, not refused.
 */
function clientEventIdOf(formData: FormData): string | undefined {
  const parsed = uuidField.safeParse(formData.get('clientEventId'));
  return parsed.success ? parsed.data : undefined;
}

/**
 * Assigns (or reassigns) the unit and the operator of a won trip
 * (assign_trip, B06): the RPC checks the status, the business unit of both,
 * the unit's documents and the operator's license (D16), and notifies the
 * operator.
 */
export async function assignCarrierTrip(_prev: FormState, formData: FormData): Promise<FormState> {
  const tripId = uuidOf(formData, 'tripId');
  const vehicleId = uuidOf(formData, 'vehicleId');
  const operatorId = uuidOf(formData, 'operatorId');
  if (!tripId) return { error: c.errors.notFound };
  if (!vehicleId || !operatorId) {
    return {
      error: carrierWebCopy.trips.assign.choose,
      values: refillValues(formEntries(formData)),
    };
  }
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('assign_trip', {
    p_trip_id: tripId,
    p_vehicle_id: vehicleId,
    p_operator_id: operatorId,
  });
  if (error) return { error: tripError(error), values: refillValues(formEntries(formData)) };
  return done(c.assign.done);
}

/**
 * Cancels a trip before the operator starts loading (cancel_trip, G5), with a
 * reason from the list and notes. After departure the unit waits for its
 * release (D20), which the fleet and the home now show.
 */
export async function cancelCarrierTrip(_prev: FormState, formData: FormData): Promise<FormState> {
  const tripId = uuidOf(formData, 'tripId');
  if (!tripId) return { error: c.errors.notFound };
  const entries = formEntries(formData);
  const parsed = cancelTripSchema.safeParse({
    reasonCode: entries.reasonCode,
    notes: entries.notes,
  });
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('cancel_trip', {
    p_trip_id: tripId,
    p_reason_code: parsed.data.reasonCode,
    // Blank is no notes (cancel_trip trims it to null).
    p_notes: parsed.data.notes ?? '',
  });
  if (error) return { error: tripError(error), values: refillValues(entries) };
  // The page reloads with the trip cancelled and its reason: that is the
  // confirmation (the form is gone), so there is no message of its own.
  revalidatePath(paths.carrier, 'layout');
  return {};
}

/**
 * Reports an incident on the trip (report_incident; it joins the timeline).
 * The attempt's key makes a double submit or a retry return the incident
 * already reported instead of reporting it again.
 */
export async function reportCarrierIncident(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tripId = uuidOf(formData, 'tripId');
  if (!tripId) return { error: c.errors.notFound };
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
    p_client_event_id: clientEventIdOf(formData),
  });
  if (error) {
    return {
      error: tripError(error),
      values: { kind: parsed.data.kind, description: parsed.data.description },
    };
  }
  return done(c.incidents.sent);
}

/**
 * Registers a file the carrier staff already uploaded to the `trip-documents`
 * bucket (D22: the service order, the Carta Porte, the invoice or another
 * document). add_trip_document checks the trip, the business unit, the side
 * that may upload the kind, the path and that the caller uploaded the file.
 */
export async function registerCarrierTripDocument(input: unknown): Promise<{ error?: string }> {
  const parsed = tripDocumentSchema.safeParse(input);
  if (!parsed.success) return { error: c.errors.generic };
  const supabase = await createClient();
  if (!supabase) return { error: authErrors.notConfigured };
  const v = parsed.data;
  const { error } = await supabase.rpc('add_trip_document', {
    p_trip_id: v.tripId,
    p_kind: v.kind,
    p_storage_path: v.storagePath,
    p_file_name: v.fileName,
  });
  if (error) return { error: tripError(error) };
  revalidatePath(paths.carrier, 'layout');
  return {};
}
