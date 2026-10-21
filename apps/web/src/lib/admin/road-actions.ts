'use server';

import {
  authErrors,
  corridorFormSchema,
  parsePesosToCents,
  roadSegmentFormSchema,
  roadsCopy,
  segmentRiskFormSchema,
  segmentTollFormSchema,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';

import { formEntries, invalidForm, refillValues, type FormState } from '../forms';
import { paths } from '../routing';
import { createClient } from '../supabase/server';
import { roadAdminErrorMessage } from './road-errors';

// Server actions of /admin/carreteras (H4, D31). The admin RPCs check the
// admin, validate again and leave every change in audit_log.

const c = roadsCopy.admin.form;
const notConfigured: FormState = { error: authErrors.notConfigured };

function done(): FormState {
  // The catalog feeds the admin page and every suggested route.
  revalidatePath(paths.adminRoads);
  revalidatePath(paths.carrier, 'layout');
  return { message: c.saved };
}

const checked = (entries: Record<string, string>, name: string) => entries[name] === 'on';

/** Creates or edits (or archives) a road segment. */
export async function saveRoadSegment(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = roadSegmentFormSchema.safeParse({
    ...entries,
    isToll: checked(entries, 'isToll'),
    archived: checked(entries, 'archived'),
  });
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const v = parsed.data;
  const { error } = await supabase.rpc('admin_upsert_road_segment', {
    ...(v.id ? { p_id: v.id } : {}),
    p_code: v.code,
    p_name: v.name,
    ...(v.highway ? { p_highway: v.highway } : {}),
    p_from_city: v.fromCity,
    p_from_state: v.fromState,
    p_from_lat: v.fromLat,
    p_from_lng: v.fromLng,
    p_to_city: v.toCity,
    p_to_state: v.toState,
    p_to_lat: v.toLat,
    p_to_lng: v.toLng,
    p_distance_km: v.distanceKm,
    p_is_toll: v.isToll,
    ...(v.notes ? { p_notes: v.notes } : {}),
    p_source: v.source,
    ...(v.sourceUrl ? { p_source_url: v.sourceUrl } : {}),
    p_source_date: v.sourceDate,
    p_data_status: v.dataStatus,
    p_archived: v.archived,
  });
  if (error) return { error: roadAdminErrorMessage(error), values: refillValues(entries) };
  return done();
}

/** Sets the toll of a class from a date; a blank amount records "Sin dato". */
export async function setSegmentToll(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const amountCents = entries.amount ? (parsePesosToCents(entries.amount) ?? Number.NaN) : null;
  const parsed = segmentTollFormSchema.safeParse({ ...entries, amountCents });
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
  const { error } = await supabase.rpc('admin_set_segment_toll', {
    p_segment_id: v.segmentId,
    p_vehicle_class: v.vehicleClass,
    // Without an amount the class is recorded as "Sin dato".
    ...(v.amountCents === null ? {} : { p_amount_cents: v.amountCents }),
    p_source: v.source,
    ...(v.sourceUrl ? { p_source_url: v.sourceUrl } : {}),
    p_valid_from: v.validFrom,
    p_data_status: v.dataStatus,
  });
  if (error) return { error: roadAdminErrorMessage(error), values: refillValues(entries) };
  return done();
}

/** Adds, edits or archives a risk of a segment. */
export async function saveSegmentRisk(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = segmentRiskFormSchema.safeParse({
    ...entries,
    archived: checked(entries, 'archived'),
  });
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const v = parsed.data;
  const { error } = await supabase.rpc('admin_upsert_segment_risk', {
    ...(v.id ? { p_id: v.id } : {}),
    p_segment_id: v.segmentId,
    p_level: v.level,
    p_from_hour: v.fromHour,
    p_to_hour: v.toHour,
    p_description: v.description,
    p_source: v.source,
    ...(v.sourceUrl ? { p_source_url: v.sourceUrl } : {}),
    p_observed_on: v.observedOn,
    p_data_status: v.dataStatus,
    p_archived: v.archived,
  });
  if (error) return { error: roadAdminErrorMessage(error), values: refillValues(entries) };
  return done();
}

/** Creates or edits (or archives) a corridor from the codes of its segments, in order. */
export async function saveCorridor(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = corridorFormSchema.safeParse({
    ...entries,
    bidirectional: checked(entries, 'bidirectional'),
    archived: checked(entries, 'archived'),
  });
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const v = parsed.data;
  const { data: segments, error: lookup } = await supabase
    .from('road_segments')
    .select('id, code')
    .in('code', v.segmentCodes)
    .is('archived_at', null);
  if (lookup) return { error: roadAdminErrorMessage(lookup), values: refillValues(entries) };
  const idByCode = new Map(segments.map((s) => [s.code, s.id]));
  const ids = v.segmentCodes.map((code) => idByCode.get(code));
  if (ids.some((id) => id === undefined)) {
    return {
      fieldErrors: { segmentCodes: roadsCopy.admin.errors.unknownSegment },
      values: refillValues(entries),
    };
  }
  const { error } = await supabase.rpc('admin_upsert_corridor', {
    ...(v.id ? { p_id: v.id } : {}),
    p_code: v.code,
    p_name: v.name,
    p_origin_city: v.originCity,
    p_origin_state: v.originState,
    p_origin_lat: v.originLat,
    p_origin_lng: v.originLng,
    p_origin_radius_km: v.originRadiusKm,
    p_destination_city: v.destinationCity,
    p_destination_state: v.destinationState,
    p_destination_lat: v.destinationLat,
    p_destination_lng: v.destinationLng,
    p_destination_radius_km: v.destinationRadiusKm,
    p_bidirectional: v.bidirectional,
    p_segment_ids: ids as string[],
    p_archived: v.archived,
  });
  if (error) return { error: roadAdminErrorMessage(error), values: refillValues(entries) };
  return done();
}
