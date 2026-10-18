import 'server-only';

import {
  ACTIVE_TRIP_STATUSES,
  pendingInvitations,
  type BusinessUnitRef,
  type InvitationSummary,
  type Tables,
} from '@transport/shared';

import { selectAll } from '../verification/paging';
import type { Supabase } from '../viewer';

// Reads of "Mi empresa" (G4, D19) and of the Gerente's supervision. RLS gives
// the Gerente the whole company (business units, coordinators, fleet and
// invitations); every write is a manager RPC in company-actions.ts.

function check<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error) throw new Error(error.message);
  if (data === null || data === undefined) throw new Error('empty response');
  return data;
}

export interface CompanyCoordinator {
  id: string;
  fullName: string | null;
  phone: string | null;
  unitIds: string[];
}

export type CompanyVehicle = Pick<
  Tables<'vehicles'>,
  'id' | 'plate' | 'fleet_number' | 'kind' | 'business_unit_id'
>;
export type CompanyOperator = Pick<
  Tables<'operators'>,
  'id' | 'full_name' | 'phone' | 'email' | 'profile_id' | 'business_unit_id'
>;

export interface ManagerCompany {
  units: BusinessUnitRef[];
  coordinators: CompanyCoordinator[];
  vehicles: CompanyVehicle[];
  operators: CompanyOperator[];
  invitations: InvitationSummary[];
}

const INVITATION_COLUMNS =
  'id, kind, business_unit_ids, operator_id, invitee_name, expires_at, accepted_at, revoked_at';

/** Everything "Mi empresa" lists: active business units, coordinators, fleet and pending links. */
export async function loadManagerCompany(
  supabase: Supabase,
  companyId: string,
): Promise<ManagerCompany> {
  const [units, coordinators, assignments, vehicles, operators, invitations] = await Promise.all([
    supabase
      .from('business_units')
      .select('id, name')
      .eq('company_id', companyId)
      .is('archived_at', null)
      .order('name'),
    supabase
      .from('profiles')
      .select('id, full_name, phone')
      .eq('company_id', companyId)
      .eq('role', 'coordinator')
      .order('full_name'),
    supabase
      .from('business_unit_coordinators')
      .select('profile_id, business_unit_id')
      .eq('company_id', companyId),
    selectAll((from, to) =>
      supabase
        .from('vehicles')
        .select('id, plate, fleet_number, kind, business_unit_id')
        .eq('company_id', companyId)
        .is('archived_at', null)
        .order('plate')
        .order('id')
        .range(from, to),
    ),
    selectAll((from, to) =>
      supabase
        .from('operators')
        .select('id, full_name, phone, email, profile_id, business_unit_id')
        .eq('company_id', companyId)
        .is('archived_at', null)
        .order('full_name')
        .order('id')
        .range(from, to),
    ),
    supabase
      .from('invitations')
      .select(INVITATION_COLUMNS)
      .eq('company_id', companyId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at')
      .limit(200),
  ]);
  const unitsOf = new Map<string, string[]>();
  for (const a of check(assignments)) {
    unitsOf.set(a.profile_id, [...(unitsOf.get(a.profile_id) ?? []), a.business_unit_id]);
  }
  return {
    units: check(units),
    coordinators: check(coordinators).map((p) => ({
      id: p.id,
      fullName: p.full_name,
      phone: p.phone,
      unitIds: unitsOf.get(p.id) ?? [],
    })),
    vehicles,
    operators,
    invitations: pendingInvitations(check(invitations), new Date()),
  };
}

export interface UnitSupervision {
  unit: BusinessUnitRef;
  active: number;
  toAssign: number;
}

/**
 * The Gerente's supervision (G4): per business unit, the trips on the road
 * (ACTIVE_TRIP_STATUSES) and those waiting for a unit and an operator.
 */
export async function loadSupervision(
  supabase: Supabase,
  units: readonly BusinessUnitRef[],
): Promise<UnitSupervision[]> {
  if (units.length === 0) return [];
  const trips = await selectAll((from, to) =>
    supabase
      .from('trips')
      .select('id, status, business_unit_id')
      .in(
        'business_unit_id',
        units.map((u) => u.id),
      )
      .in('status', [...ACTIVE_TRIP_STATUSES, 'pending_assignment'])
      .order('id')
      .range(from, to),
  );
  const active = new Set<string>(ACTIVE_TRIP_STATUSES);
  return units.map((unit) => {
    const mine = trips.filter((t) => t.business_unit_id === unit.id);
    return {
      unit,
      active: mine.filter((t) => active.has(t.status)).length,
      toAssign: mine.filter((t) => t.status === 'pending_assignment').length,
    };
  });
}
