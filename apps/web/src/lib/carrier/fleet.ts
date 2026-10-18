import 'server-only';

import {
  applicableRequirements,
  expiredRequirementIds,
  requirementProgress,
  uuidField,
  vehicleReadiness,
  type Requirement,
  type RequirementProgress,
  type SubmittedDocument,
  type Tables,
  type VehicleReadiness,
} from '@transport/shared';

import { selectAll } from '../verification/paging';
import type { Supabase } from '../viewer';

// Reads of the carrier's fleet screens (G10b; B18 on the app). Everything
// goes through the user's JWT: RLS limits a Coordinador to the units and
// operators of their business units and the Gerente to the company (G1a),
// and every write happens in fleet-actions.ts (RPCs for availability, plain
// updates of the fleet's own columns, soft deletes).

function check<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error) throw new Error(error.message);
  if (data === null || data === undefined) throw new Error('empty response');
  return data;
}

const REQUIREMENT_COLUMNS =
  'id, code, name, description, owner_type, company_type, taxpayer_type, is_required, optional_for, requires_expiry, sort_order, archived_at';
const DOCUMENT_COLUMNS =
  'id, requirement_id, owner_type, owner_id, status, review_notes, expires_at, created_at, archived_at, file_name';

export type FleetProgress = RequirementProgress<Requirement, SubmittedDocument>[];

/** The company, the active requirement catalog and the company's documents. */
export interface FleetContext {
  company: Pick<Tables<'companies'>, 'id' | 'type' | 'rfc' | 'legal_name'>;
  requirements: Requirement[];
  documents: SubmittedDocument[];
}

/** Loads what the readiness and the document list of every unit and operator need. */
export async function loadFleetContext(
  supabase: Supabase,
  companyId: string,
): Promise<FleetContext> {
  const [company, requirements, documents] = await Promise.all([
    supabase.from('companies').select('id, type, rfc, legal_name').eq('id', companyId).single(),
    supabase.from('document_requirements').select(REQUIREMENT_COLUMNS).is('archived_at', null),
    selectAll((from, to) =>
      supabase
        .from('documents')
        .select(DOCUMENT_COLUMNS)
        .eq('company_id', companyId)
        .is('archived_at', null)
        .order('id')
        .range(from, to),
    ),
  ]);
  return { company: check(company), requirements: check(requirements), documents };
}

/** Requirements of one unit or operator with the state of each (requirementProgress). */
export function ownerProgress(
  context: FleetContext,
  owner: { type: 'vehicle' | 'operator'; id: string },
): FleetProgress {
  const requirements = applicableRequirements(context.requirements, owner.type, context.company);
  return requirementProgress(requirements, context.documents, owner);
}

// ---------------------------------------------------------------------------
// Units (vehicles) and availability
// ---------------------------------------------------------------------------

export type Availability = Pick<
  Tables<'vehicle_availability'>,
  'vehicle_id' | 'available_from' | 'city' | 'state'
>;

export type VehicleRow = Pick<
  Tables<'vehicles'>,
  | 'id'
  | 'kind'
  | 'plate'
  | 'fleet_number'
  | 'model_year'
  | 'unit_type'
  | 'capacity_kg'
  | 'capacity_m3'
  | 'features'
  | 'business_unit_id'
  | 'current_operator_id'
>;

export interface VehicleSummary extends VehicleRow {
  availability: Availability | null;
  readiness: VehicleReadiness;
  /** Name of the business unit that runs it (G1a). */
  businessUnitName: string | null;
}

const VEHICLE_COLUMNS =
  'id, kind, plate, fleet_number, model_year, unit_type, capacity_kg, capacity_m3, features, business_unit_id, current_operator_id, business_unit:business_units!vehicles_business_unit_fkey(name)';

/**
 * Active units of the given business units, oldest first, with their current
 * availability and readiness. RLS already limits a Coordinador to their
 * units; the filter applies the picker's selection.
 */
export async function listCarrierVehicles(
  supabase: Supabase,
  context: FleetContext,
  businessUnitIds: readonly string[],
): Promise<VehicleSummary[]> {
  if (businessUnitIds.length === 0) return [];
  const [vehicles, availability] = await Promise.all([
    supabase
      .from('vehicles')
      .select(VEHICLE_COLUMNS)
      .eq('company_id', context.company.id)
      .in('business_unit_id', [...businessUnitIds])
      .is('archived_at', null)
      .order('created_at'),
    supabase
      .from('vehicle_availability')
      .select('vehicle_id, available_from, city, state')
      .eq('company_id', context.company.id)
      .is('archived_at', null),
  ]);
  const byVehicle = new Map(check(availability).map((a) => [a.vehicle_id, a]));
  const requirements = applicableRequirements(context.requirements, 'vehicle', context.company);
  return check(vehicles).map(({ business_unit: unit, ...vehicle }) => {
    const current = byVehicle.get(vehicle.id) ?? null;
    return {
      ...vehicle,
      businessUnitName: unit?.name ?? null,
      availability: current,
      readiness: vehicleReadiness({
        expiredDocuments:
          expiredRequirementIds(requirements, context.documents, {
            type: 'vehicle',
            id: vehicle.id,
          }).length > 0,
        availableFrom: current?.available_from ?? null,
      }),
    };
  });
}

/** One active unit of the company with its documents, or null (not found, archived or not visible). */
export async function getCarrierVehicle(
  supabase: Supabase,
  context: FleetContext,
  vehicleId: string,
): Promise<(VehicleSummary & { progress: FleetProgress }) | null> {
  if (!uuidField.safeParse(vehicleId).success) return null;
  const { data, error } = await supabase
    .from('vehicles')
    .select('business_unit_id')
    .eq('id', vehicleId)
    .eq('company_id', context.company.id)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw new Error(`Vehicle query failed: ${error.message}`);
  if (!data) return null;
  const vehicle = (await listCarrierVehicles(supabase, context, [data.business_unit_id])).find(
    (v) => v.id === vehicleId,
  );
  if (!vehicle) return null;
  return { ...vehicle, progress: ownerProgress(context, { type: 'vehicle', id: vehicle.id }) };
}

// ---------------------------------------------------------------------------
// Operators
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
  | 'business_unit_id'
>;

export interface OperatorSummary extends OperatorRow {
  /** Pending (not accepted, revoked or expired) invitation, if any (D15). */
  invitation: Pick<Tables<'operator_invitations'>, 'id' | 'expires_at'> | null;
  /** Name of the business unit the operator drives for (G1a). */
  businessUnitName: string | null;
}

const OPERATOR_COLUMNS =
  'id, full_name, email, phone, license_number, license_type, license_expires_on, profile_id, business_unit_id, business_unit:business_units!operators_business_unit_fkey(name)';

/** Active operators of the given business units, oldest first, with their pending invitation. */
export async function listCarrierOperators(
  supabase: Supabase,
  companyId: string,
  businessUnitIds: readonly string[],
): Promise<OperatorSummary[]> {
  if (businessUnitIds.length === 0) return [];
  const [operators, invitations] = await Promise.all([
    supabase
      .from('operators')
      .select(OPERATOR_COLUMNS)
      .eq('company_id', companyId)
      .in('business_unit_id', [...businessUnitIds])
      .is('archived_at', null)
      .order('created_at'),
    supabase
      .from('operator_invitations')
      .select('id, operator_id, expires_at')
      .eq('company_id', companyId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()),
  ]);
  const pending = new Map(check(invitations).map((i) => [i.operator_id, i]));
  return check(operators).map(({ business_unit: unit, ...operator }) => ({
    ...operator,
    businessUnitName: unit?.name ?? null,
    invitation: pending.get(operator.id) ?? null,
  }));
}

/** One active operator of the company with its documents, or null. */
export async function getCarrierOperator(
  supabase: Supabase,
  context: FleetContext,
  operatorId: string,
): Promise<(OperatorSummary & { progress: FleetProgress }) | null> {
  if (!uuidField.safeParse(operatorId).success) return null;
  const { data, error } = await supabase
    .from('operators')
    .select('business_unit_id')
    .eq('id', operatorId)
    .eq('company_id', context.company.id)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw new Error(`Operator query failed: ${error.message}`);
  if (!data) return null;
  const operator = (
    await listCarrierOperators(supabase, context.company.id, [data.business_unit_id])
  ).find((o) => o.id === operatorId);
  if (!operator) return null;
  return { ...operator, progress: ownerProgress(context, { type: 'operator', id: operator.id }) };
}

// ---------------------------------------------------------------------------
// Usual routes (a company matter: the Gerente and every Coordinador, G1a)
// ---------------------------------------------------------------------------

export type RouteRow = Pick<
  Tables<'carrier_routes'>,
  'id' | 'origin_city' | 'origin_state' | 'destination_city' | 'destination_state' | 'unit_types'
>;

export async function listCarrierRoutes(
  supabase: Supabase,
  companyId: string,
): Promise<RouteRow[]> {
  return check(
    await supabase
      .from('carrier_routes')
      .select('id, origin_city, origin_state, destination_city, destination_state, unit_types')
      .eq('company_id', companyId)
      .is('archived_at', null)
      .order('created_at'),
  );
}
