'use server';

import {
  authErrors,
  availabilityFormSchema,
  carrierRouteFormSchema,
  carrierWebCopy,
  cityPreset,
  endOfDayInMexicoCity,
  fleetCopy,
  fleetErrorCopy,
  fleetErrorText,
  fromEwkbPoint,
  isManager,
  operatorDraftSchemaFor,
  submitDocumentSchema,
  toEwktPoint,
  uuidField,
  vehicleFormSchema,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { formEntries, invalidForm, refillValues, type FormState } from '../forms';
import { withParams } from '../pagination';
import { carrierOperatorPath, carrierUnitPath, paths } from '../routing';
import { getViewer } from '../session';
import { createClient } from '../supabase/server';
import { onboardingErrorMessage } from '../verification/errors';
import { SAVED_CITY_ID } from './availability';
import { FLEET_FLASH_PARAM, operatorSchemaInput, vehicleSchemaInput } from './fleet-forms';

// Server actions of the carrier's fleet screens (G10b; B18 on the app).
// Availability changes only through its RPCs (set_vehicle_availability,
// clear_vehicle_availability) and documents through submit_document; the
// fleet's own columns are plain writes that RLS limits to the viewer's
// business units (G1a) and that the triggers guard (archiving needs the
// Gerente and no trip in progress; a new row needs a business unit).

const c = carrierWebCopy.fleet;
const notConfigured: FormState = { error: authErrors.notConfigured };

/** A uuid from a hidden input; anything malformed is treated as not found. */
function uuidOf(formData: FormData, name: string): string | null {
  const parsed = uuidField.safeParse(formData.get(name));
  return parsed.success ? parsed.data : null;
}

/** Spanish message for an error of a fleet write (fixed English messages). */
function fleetError(error: { message?: string | null } | null): string {
  return fleetErrorText(error?.message ?? '') ?? c.errors.generic;
}

function done(message: string): FormState {
  // Lists, details, recommendations and the assignment options all change.
  revalidatePath(paths.carrier, 'layout');
  return { message };
}

/** The signed-in Gerente's company id, or null for anyone else (adding and archiving, G1a). */
async function managerCompanyId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer && isManager(viewer.role) && viewer.company ? viewer.company.id : null;
}

// ---------------------------------------------------------------------------
// Units (vehicles)
// ---------------------------------------------------------------------------

/**
 * Registers a unit (the Gerente, in a business unit of the company) or
 * edits one (the Gerente or the Coordinador of its business unit). The kind
 * never changes after registration (vehicleFormSchema still validates it).
 */
export async function saveCarrierVehicle(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = vehicleFormSchema.safeParse(
    vehicleSchemaInput(entries, formData.getAll('features').map(String)),
  );
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const v = parsed.data;
  const columns = {
    plate: v.plate,
    fleet_number: v.fleetNumber ?? null,
    model_year: v.modelYear ?? null,
    unit_type: v.unitType ?? null,
    capacity_kg: v.capacityKg ?? null,
    capacity_m3: v.capacityM3 ?? null,
    features: v.features,
    axle_count: v.axleCount ?? null,
  };
  const vehicleId = uuidOf(formData, 'vehicleId');
  if (vehicleId) {
    const { data, error } = await supabase
      .from('vehicles')
      .update(columns)
      .eq('id', vehicleId)
      .is('archived_at', null)
      .select('id')
      .maybeSingle();
    if (error) return { error: fleetError(error), values: refillValues(entries) };
    if (!data) return { error: c.units.notFound, values: refillValues(entries) };
    return done(c.units.saved);
  }

  const companyId = await managerCompanyId();
  const businessUnitId = uuidOf(formData, 'businessUnitId');
  if (!companyId) return { error: c.managerOnly, values: refillValues(entries) };
  if (!businessUnitId) {
    return {
      fieldErrors: { businessUnitId: fleetErrorCopy.businessUnitRequired },
      values: refillValues(entries),
    };
  }
  // The composite foreign key (company_id, business_unit_id) refuses a
  // business unit of another company; RLS refuses anyone but the Gerente.
  const { data, error } = await supabase
    .from('vehicles')
    .insert({ ...columns, kind: v.kind, company_id: companyId, business_unit_id: businessUnitId })
    .select('id')
    .single();
  if (error) return { error: fleetError(error), values: refillValues(entries) };
  revalidatePath(paths.carrier, 'layout');
  redirect(withParams(carrierUnitPath(data.id), {}, { [FLEET_FLASH_PARAM]: 'alta' }));
}

/** Archives a unit (the Gerente; the trigger refuses it with a trip in progress). */
export async function archiveCarrierVehicle(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const vehicleId = uuidOf(formData, 'vehicleId');
  if (!vehicleId) return { error: c.units.notFound };
  if (!(await managerCompanyId())) return { error: c.managerOnly };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('vehicles')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', vehicleId)
    .is('archived_at', null)
    .select('id')
    .maybeSingle();
  if (error) return { error: fleetError(error) };
  if (!data) return { error: c.units.notFound };
  revalidatePath(paths.carrier, 'layout');
  redirect(withParams(paths.carrierUnits, {}, { [FLEET_FLASH_PARAM]: 'baja' }));
}

/** Where and from when a unit is free (set_vehicle_availability; a preset city, B18). */
export async function setCarrierAvailability(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const vehicleId = uuidOf(formData, 'vehicleId');
  if (!vehicleId) return { error: c.units.notFound };
  const entries = formEntries(formData);
  const keepSaved = entries.cityId === SAVED_CITY_ID;
  const parsed = availabilityFormSchema.safeParse({
    // The saved place is not a preset; any preset id validates the moment.
    cityId: keepSaved ? 'mty' : entries.cityId,
    date: entries.date,
    time: entries.time,
  });
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const city = keepSaved
    ? await savedPlace(supabase, vehicleId)
    : (cityPreset(parsed.data.cityId) ?? null);
  if (!city) return { error: c.errors.generic, values: refillValues(entries) };
  const { error } = await supabase.rpc('set_vehicle_availability', {
    p_vehicle_id: vehicleId,
    p_available_from: parsed.data.availableFrom,
    p_latitude: city.lat,
    p_longitude: city.lng,
    p_city: city.city,
    p_state: city.state,
  });
  if (error) return { error: fleetError(error), values: refillValues(entries) };
  return done(fleetCopy.availability.saved);
}

/** The place of the unit's current availability (RLS: the viewer's business units). */
async function savedPlace(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  vehicleId: string,
): Promise<{ city: string; state: string; lat: number; lng: number } | null> {
  const { data, error } = await supabase
    .from('vehicle_availability')
    .select('city, state, location')
    .eq('vehicle_id', vehicleId)
    .is('archived_at', null)
    .maybeSingle();
  if (error || !data) return null;
  const point = fromEwkbPoint(data.location);
  return point && { city: data.city, state: data.state, ...point };
}

/** Marks a unit as not available (clear_vehicle_availability). */
export async function clearCarrierAvailability(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const vehicleId = uuidOf(formData, 'vehicleId');
  if (!vehicleId) return { error: c.units.notFound };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('clear_vehicle_availability', { p_vehicle_id: vehicleId });
  if (error) return { error: fleetError(error) };
  return done(c.availability.cleared);
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

/**
 * Registers an operator (the Gerente, in a business unit of the company) or
 * edits one (the Gerente or the Coordinador of its business unit). The email
 * is the invitation's identity: it cannot change once the operator uses the
 * app, so the form sends the current one.
 */
export async function saveCarrierOperator(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const entries = formEntries(formData);
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const operatorId = uuidOf(formData, 'operatorId');
  // Editing: the license date already saved is kept even if it has expired,
  // so an expired license does not block changing other fields (assign_trip
  // still refuses that operator, D16).
  let keptLicenseExpiresOn: string | null = null;
  if (operatorId) {
    const { data: saved, error } = await supabase
      .from('operators')
      .select('license_expires_on')
      .eq('id', operatorId)
      .is('archived_at', null)
      .maybeSingle();
    if (error) return { error: fleetError(error), values: refillValues(entries) };
    if (!saved) return { error: c.operators.notFound, values: refillValues(entries) };
    keptLicenseExpiresOn = saved.license_expires_on;
  }
  const parsed = operatorDraftSchemaFor(keptLicenseExpiresOn).safeParse(
    operatorSchemaInput(entries),
  );
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const v = parsed.data;
  const columns = {
    full_name: v.fullName,
    email: v.email,
    phone: v.phone ?? null,
    license_number: v.licenseNumber ?? null,
    license_type: v.licenseType ?? null,
    license_expires_on: v.licenseExpiresOn ?? null,
  };
  if (operatorId) {
    const { data, error } = await supabase
      .from('operators')
      .update(columns)
      .eq('id', operatorId)
      .is('archived_at', null)
      .select('id')
      .maybeSingle();
    if (error) return { error: fleetError(error), values: refillValues(entries) };
    if (!data) return { error: c.operators.notFound, values: refillValues(entries) };
    return done(c.operators.saved);
  }

  const companyId = await managerCompanyId();
  const businessUnitId = uuidOf(formData, 'businessUnitId');
  if (!companyId) return { error: c.managerOnly, values: refillValues(entries) };
  if (!businessUnitId) {
    return {
      fieldErrors: { businessUnitId: fleetErrorCopy.businessUnitRequired },
      values: refillValues(entries),
    };
  }
  const { data, error } = await supabase
    .from('operators')
    .insert({ ...columns, company_id: companyId, business_unit_id: businessUnitId })
    .select('id')
    .single();
  if (error) return { error: fleetError(error), values: refillValues(entries) };
  revalidatePath(paths.carrier, 'layout');
  redirect(withParams(carrierOperatorPath(data.id), {}, { [FLEET_FLASH_PARAM]: 'alta' }));
}

/** Archives an operator (the Gerente; the trigger refuses it with a trip in progress). */
export async function archiveCarrierOperator(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const operatorId = uuidOf(formData, 'operatorId');
  if (!operatorId) return { error: c.operators.notFound };
  if (!(await managerCompanyId())) return { error: c.managerOnly };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('operators')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', operatorId)
    .is('archived_at', null)
    .select('id')
    .maybeSingle();
  if (error) return { error: fleetError(error) };
  if (!data) return { error: c.operators.notFound };
  revalidatePath(paths.carrier, 'layout');
  redirect(withParams(paths.carrierOperators, {}, { [FLEET_FLASH_PARAM]: 'baja' }));
}

// ---------------------------------------------------------------------------
// Usual routes
// ---------------------------------------------------------------------------

/** Adds a usual route of the company between two preset cities (B18). */
export async function addCarrierRoute(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = carrierRouteFormSchema.safeParse({
    originId: entries.originId,
    destinationId: entries.destinationId,
    unitTypes: formData.getAll('unitTypes').map(String),
  });
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const origin = cityPreset(parsed.data.originId);
  const destination = cityPreset(parsed.data.destinationId);
  const viewer = await getViewer();
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  if (!origin || !destination || !viewer?.company) return { error: c.errors.generic };
  const { error } = await supabase.from('carrier_routes').insert({
    company_id: viewer.company.id,
    origin_city: origin.city,
    origin_state: origin.state,
    origin_location: toEwktPoint(origin),
    destination_city: destination.city,
    destination_state: destination.state,
    destination_location: toEwktPoint(destination),
    unit_types: parsed.data.unitTypes,
    notes: parsed.data.notes ?? null,
  });
  if (error) return { error: fleetError(error), values: refillValues(entries) };
  return done(c.routes.added);
}

/** Removes (archives) a usual route of the company. */
export async function archiveCarrierRoute(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const routeId = uuidOf(formData, 'routeId');
  if (!routeId) return { error: c.errors.notFound };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('carrier_routes')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', routeId)
    .is('archived_at', null)
    .select('id')
    .maybeSingle();
  if (error) return { error: fleetError(error) };
  if (!data) return { error: c.errors.notFound };
  return done(c.routes.removed);
}

// ---------------------------------------------------------------------------
// Documents of a unit or an operator (B12 form, D16 catalog)
// ---------------------------------------------------------------------------

/**
 * Registers a file already uploaded to the `documents` bucket as a document
 * of a unit or an operator. submit_document checks the owner (the business
 * unit, G1a), the requirement, the path and that the file exists.
 */
export async function registerFleetDocument(input: unknown): Promise<{ error?: string }> {
  const parsed = submitDocumentSchema.safeParse(input);
  if (!parsed.success || parsed.data.ownerType === 'company') return { error: c.errors.generic };
  const supabase = await createClient();
  if (!supabase) return { error: authErrors.notConfigured };
  const v = parsed.data;
  const { error } = await supabase.rpc('submit_document', {
    p_requirement_id: v.requirementId,
    p_owner_type: v.ownerType,
    p_owner_id: v.ownerId,
    p_storage_path: v.storagePath,
    p_file_name: v.fileName,
    p_expires_at: v.expiresOn ? endOfDayInMexicoCity(v.expiresOn) : undefined,
  });
  if (error) return { error: fleetErrorText(error.message) ?? onboardingErrorMessage(error) };
  revalidatePath(paths.carrier, 'layout');
  return {};
}
