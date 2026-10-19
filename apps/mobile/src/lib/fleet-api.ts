import {
  applicableRequirements,
  cityPreset,
  expiredRequirementIds,
  requirementProgress,
  toEwktPoint,
  vehicleReadiness,
  type CarrierRouteFormValues,
  type DocumentOwnerType,
  type OperatorDraftValues,
  type Requirement,
  type SubmittedDocument,
  type Tables,
  type TablesInsert,
  type VehicleFormValues,
  type VehicleReadiness,
} from '@transport/shared';

import { vehicleColumns, type VehicleRow } from './fleet-forms';
import type { Supabase } from './supabase';

// Data access of the carrier's fleet screens (B18). Everything goes through
// the user's JWT: RLS limits each query to the carrier's own company, and
// availability, invitations and documents change only through RPCs.

/** Data of a PostgREST response; throws its error so loaders and actions can map it. */
function check<T>({ data, error }: { data: T; error: unknown }): NonNullable<T> {
  if (error) throw error;
  if (data === null || data === undefined) throw new Error('empty response');
  return data;
}

/**
 * A new unit or operator, in the business unit chosen on the form (G4) or,
 * when the user operates only one, without it: the default_business_unit
 * trigger gives it that one. The generated types cannot know that.
 */
function withBusinessUnit<T extends { business_unit_id: string }>(
  row: Omit<T, 'business_unit_id'>,
  businessUnitId: string | undefined,
): T {
  return (businessUnitId ? { ...row, business_unit_id: businessUnitId } : row) as T;
}

/** Where a new unit or operator goes: the company and, if chosen, its business unit. */
export interface NewFleetRow {
  companyId: string;
  businessUnitId?: string | undefined;
}

/** Throws the error of a write that returns no data. */
function ok({ error }: { error: unknown }): void {
  if (error) throw error;
}

export interface CompanyContext {
  company: Pick<Tables<'companies'>, 'id' | 'type' | 'rfc' | 'legal_name'>;
  requirements: Requirement[];
  documents: SubmittedDocument[];
}

const DOCUMENT_COLUMNS =
  'id, requirement_id, owner_type, owner_id, status, review_notes, expires_at, created_at, archived_at, file_name';

/** The carrier's company, the requirement catalog and its active documents. */
export async function loadCompanyContext(
  client: Supabase,
  companyId: string,
): Promise<CompanyContext> {
  const [company, requirements, documents] = await Promise.all([
    client.from('companies').select('id, type, rfc, legal_name').eq('id', companyId).single(),
    client.from('document_requirements').select('*').is('archived_at', null),
    client
      .from('documents')
      .select(DOCUMENT_COLUMNS)
      .eq('company_id', companyId)
      .is('archived_at', null),
  ]);
  return {
    company: check(company),
    requirements: check(requirements),
    documents: check(documents),
  };
}

/** Requirements of one owner with the state of each (see requirementProgress). */
export function ownerProgress(
  context: CompanyContext,
  owner: { type: DocumentOwnerType; id: string },
) {
  const requirements = applicableRequirements(context.requirements, owner.type, context.company);
  return requirementProgress(requirements, context.documents, owner);
}

// ---------------------------------------------------------------------------
// Vehicles and availability
// ---------------------------------------------------------------------------

export type Availability = Pick<
  Tables<'vehicle_availability'>,
  'vehicle_id' | 'available_from' | 'city' | 'state'
>;

export interface VehicleSummary extends VehicleRow, Pick<Tables<'vehicles'>, 'business_unit_id'> {
  availability: Availability | null;
  readiness: VehicleReadiness;
  /** Name of the business unit that runs it (G1a.2). */
  businessUnitName: string | null;
  businessUnitId: string;
}

const VEHICLE_COLUMNS =
  'id, kind, plate, fleet_number, model_year, unit_type, capacity_kg, capacity_m3, features, business_unit_id, business_units(name)';

export async function listVehicles(
  client: Supabase,
  context: CompanyContext,
): Promise<VehicleSummary[]> {
  const [vehicles, availability, pending] = await Promise.all([
    client
      .from('vehicles')
      .select(VEHICLE_COLUMNS)
      .eq('company_id', context.company.id)
      .is('archived_at', null)
      .order('created_at'),
    client
      .from('vehicle_availability')
      .select('vehicle_id, available_from, city, state')
      .eq('company_id', context.company.id)
      .is('archived_at', null),
    // Units waiting for their release (G5); RLS: the units the user runs.
    client
      .from('vehicle_release_tasks')
      .select('vehicle_id')
      .eq('company_id', context.company.id)
      .eq('status', 'pending'),
  ]);
  const byVehicle = new Map(check(availability).map((a) => [a.vehicle_id, a]));
  const pendingRelease = new Set(check(pending).map((t) => t.vehicle_id));
  return check(vehicles).map(({ business_units: unit, ...vehicle }) => {
    const current = byVehicle.get(vehicle.id) ?? null;
    const owner = { type: 'vehicle', id: vehicle.id } as const;
    const requirements = applicableRequirements(context.requirements, 'vehicle', context.company);
    return {
      ...vehicle,
      businessUnitName: unit?.name ?? null,
      businessUnitId: vehicle.business_unit_id,
      availability: current,
      readiness: vehicleReadiness({
        expiredDocuments: expiredRequirementIds(requirements, context.documents, owner).length > 0,
        availableFrom: current?.available_from ?? null,
        pendingRelease: pendingRelease.has(vehicle.id),
      }),
    };
  });
}

export async function saveVehicle(
  client: Supabase,
  values: VehicleFormValues,
  target: { id: string } | NewFleetRow,
): Promise<string> {
  const columns = vehicleColumns(values);
  if ('id' in target) {
    ok(await client.from('vehicles').update(columns).eq('id', target.id));
    return target.id;
  }
  const row = check(
    await client
      .from('vehicles')
      .insert(
        withBusinessUnit<TablesInsert<'vehicles'>>(
          { ...columns, kind: values.kind, company_id: target.companyId },
          target.businessUnitId,
        ),
      )
      .select('id')
      .single(),
  );
  return row.id;
}

export async function archiveVehicle(client: Supabase, id: string): Promise<void> {
  ok(await client.from('vehicles').update({ archived_at: new Date().toISOString() }).eq('id', id));
}

export async function setAvailability(
  client: Supabase,
  vehicleId: string,
  { cityId, availableFrom }: { cityId: string; availableFrom: string },
): Promise<void> {
  const city = cityPreset(cityId);
  if (!city) throw new RangeError(`Unknown city: ${cityId}`);
  ok(
    await client.rpc('set_vehicle_availability', {
      p_vehicle_id: vehicleId,
      p_available_from: availableFrom,
      p_latitude: city.lat,
      p_longitude: city.lng,
      p_city: city.city,
      p_state: city.state,
    }),
  );
}

export async function clearAvailability(client: Supabase, vehicleId: string): Promise<void> {
  ok(await client.rpc('clear_vehicle_availability', { p_vehicle_id: vehicleId }));
}

// ---------------------------------------------------------------------------
// Operators and invitation links (G1b, G2)
// ---------------------------------------------------------------------------

export type OperatorRow = Pick<
  Tables<'operators'>,
  | 'id'
  | 'full_name'
  | 'email'
  | 'phone'
  | 'license_number'
  | 'license_type'
  | 'license_expires_on'
  | 'profile_id'
>;

export type InvitationRow = Pick<Tables<'invitations'>, 'id' | 'operator_id' | 'expires_at'>;

export interface OperatorSummary
  extends OperatorRow, Pick<Tables<'operators'>, 'business_unit_id'> {
  /** Pending (not accepted, revoked or expired) invitation, if any. */
  invitation: InvitationRow | null;
  /** Name of the business unit the operator drives for (G1a.2). */
  businessUnitName: string | null;
  businessUnitId: string;
}

export async function listOperators(
  client: Supabase,
  companyId: string,
): Promise<OperatorSummary[]> {
  const [operators, invitations] = await Promise.all([
    client
      .from('operators')
      .select(
        'id, full_name, email, phone, license_number, license_type, license_expires_on, profile_id, business_unit_id, business_units(name)',
      )
      .eq('company_id', companyId)
      .is('archived_at', null)
      .order('created_at'),
    client
      .from('invitations')
      .select('id, operator_id, expires_at')
      .eq('company_id', companyId)
      .eq('kind', 'operator')
      .not('operator_id', 'is', null)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()),
  ]);
  const pending = new Map(check(invitations).map((i) => [i.operator_id ?? '', i]));
  return check(operators).map(({ business_units: unit, ...o }) => ({
    ...o,
    businessUnitName: unit?.name ?? null,
    businessUnitId: o.business_unit_id,
    invitation: pending.get(o.id) ?? null,
  }));
}

export async function saveOperator(
  client: Supabase,
  values: OperatorDraftValues,
  target: { id: string } | NewFleetRow,
): Promise<string> {
  const columns = {
    full_name: values.fullName,
    email: values.email ?? null,
    phone: values.phone ?? null,
    license_number: values.licenseNumber ?? null,
    license_type: values.licenseType ?? null,
    license_expires_on: values.licenseExpiresOn ?? null,
  };
  if ('id' in target) {
    ok(await client.from('operators').update(columns).eq('id', target.id));
    return target.id;
  }
  const row = check(
    await client
      .from('operators')
      .insert(
        withBusinessUnit<TablesInsert<'operators'>>(
          { ...columns, company_id: target.companyId },
          target.businessUnitId,
        ),
      )
      .select('id')
      .single(),
  );
  return row.id;
}

export async function archiveOperator(client: Supabase, id: string): Promise<void> {
  ok(await client.from('operators').update({ archived_at: new Date().toISOString() }).eq('id', id));
}

/**
 * Issues an invitation link for an operator row without an account (G2),
 * revoking the previous one. The plain token is only returned here; the
 * database keeps its SHA-256.
 */
export async function createInvitation(
  client: Supabase,
  operatorId: string,
): Promise<{ invitationId: string; token: string; expiresAt: string }> {
  const rows = check(
    await client.rpc('create_invitation', {
      p_kind: 'operator',
      p_business_unit_ids: [],
      p_operator_id: operatorId,
    }),
  );
  const row = rows[0];
  if (!row) throw new Error('create_invitation returned no row');
  return { invitationId: row.invitation_id, token: row.token, expiresAt: row.expires_at };
}

export async function revokeInvitation(client: Supabase, invitationId: string): Promise<void> {
  ok(await client.rpc('revoke_invitation', { p_invitation_id: invitationId }));
}

// ---------------------------------------------------------------------------
// Usual routes
// ---------------------------------------------------------------------------

export type RouteRow = Pick<
  Tables<'carrier_routes'>,
  'id' | 'origin_city' | 'origin_state' | 'destination_city' | 'destination_state' | 'unit_types'
>;

export async function listRoutes(client: Supabase, companyId: string): Promise<RouteRow[]> {
  return check(
    await client
      .from('carrier_routes')
      .select('id, origin_city, origin_state, destination_city, destination_state, unit_types')
      .eq('company_id', companyId)
      .is('archived_at', null)
      .order('created_at'),
  );
}

export async function addRoute(
  client: Supabase,
  companyId: string,
  values: CarrierRouteFormValues,
): Promise<void> {
  const origin = cityPreset(values.originId);
  const destination = cityPreset(values.destinationId);
  if (!origin || !destination) throw new RangeError('Unknown city');
  ok(
    await client.from('carrier_routes').insert({
      company_id: companyId,
      origin_city: origin.city,
      origin_state: origin.state,
      origin_location: toEwktPoint(origin),
      destination_city: destination.city,
      destination_state: destination.state,
      destination_location: toEwktPoint(destination),
      unit_types: values.unitTypes,
      notes: values.notes ?? null,
    }),
  );
}

export async function archiveRoute(client: Supabase, id: string): Promise<void> {
  ok(
    await client
      .from('carrier_routes')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id),
  );
}
