import {
  pendingInvitations,
  type BusinessUnitRef,
  type InvitationSummary,
  type Tables,
} from '@transport/shared';

import type { Supabase } from './supabase';

// Data access of "Mi empresa" (G4) and of the invitation links of the fleet
// screens. Reads go through RLS (business units and invitations are visible
// to the company's staff, narrowed to a coordinator's business units); every
// write is one of the manager RPCs (…_manager_company.sql) or the invitation
// RPCs of G1b, which check the caller again.

function check<T>({ data, error }: { data: T; error: unknown }): NonNullable<T> {
  if (error) throw error;
  if (data === null || data === undefined) throw new Error('empty response');
  return data;
}

function ok({ error }: { error: unknown }): void {
  if (error) throw error;
}

/**
 * Active business units the signed-in staff operates: every one of the
 * company for the Gerente, the assigned ones for a Coordinador
 * (auth_business_unit_ids), by name.
 */
export async function listOperableBusinessUnits(
  client: Supabase,
  companyId: string,
): Promise<BusinessUnitRef[]> {
  const [ids, units] = await Promise.all([
    client.rpc('auth_business_unit_ids'),
    client
      .from('business_units')
      .select('id, name')
      .eq('company_id', companyId)
      .is('archived_at', null),
  ]);
  const operable = new Set(check(ids));
  return check(units)
    .filter((unit) => operable.has(unit.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export interface CompanyCoordinator {
  id: string;
  fullName: string | null;
  phone: string | null;
  unitIds: string[];
}

export type CompanyUnit = Pick<
  Tables<'vehicles'>,
  'id' | 'plate' | 'fleet_number' | 'kind' | 'business_unit_id'
>;
export type CompanyOperator = Pick<
  Tables<'operators'>,
  'id' | 'full_name' | 'phone' | 'profile_id' | 'business_unit_id'
>;

export interface ManagerCompany {
  units: BusinessUnitRef[];
  coordinators: CompanyCoordinator[];
  vehicles: CompanyUnit[];
  operators: CompanyOperator[];
  invitations: InvitationSummary[];
}

const INVITATION_COLUMNS =
  'id, kind, business_unit_ids, operator_id, invitee_name, expires_at, accepted_at, revoked_at';

/** Everything "Mi empresa" lists, for the Gerente (RLS gives them the whole company). */
export async function loadManagerCompany(
  client: Supabase,
  companyId: string,
): Promise<ManagerCompany> {
  const [units, coordinators, assignments, vehicles, operators, invitations] = await Promise.all([
    client
      .from('business_units')
      .select('id, name')
      .eq('company_id', companyId)
      .is('archived_at', null)
      .order('name'),
    client
      .from('profiles')
      .select('id, full_name, phone')
      .eq('company_id', companyId)
      .eq('role', 'coordinator')
      .order('full_name'),
    client
      .from('business_unit_coordinators')
      .select('profile_id, business_unit_id')
      .eq('company_id', companyId),
    client
      .from('vehicles')
      .select('id, plate, fleet_number, kind, business_unit_id')
      .eq('company_id', companyId)
      .is('archived_at', null)
      .order('plate'),
    client
      .from('operators')
      .select('id, full_name, phone, profile_id, business_unit_id')
      .eq('company_id', companyId)
      .is('archived_at', null)
      .order('full_name'),
    client
      .from('invitations')
      .select(INVITATION_COLUMNS)
      .eq('company_id', companyId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('expires_at'),
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
    vehicles: check(vehicles),
    operators: check(operators),
    invitations: pendingInvitations(check(invitations), new Date()),
  };
}

export async function createBusinessUnit(client: Supabase, name: string): Promise<void> {
  ok(await client.rpc('create_business_unit', { p_name: name }));
}

export async function renameBusinessUnit(
  client: Supabase,
  id: string,
  name: string,
): Promise<void> {
  ok(await client.rpc('rename_business_unit', { p_id: id, p_name: name }));
}

export async function archiveBusinessUnit(client: Supabase, id: string): Promise<void> {
  ok(await client.rpc('archive_business_unit', { p_id: id }));
}

export async function setCoordinatorUnits(
  client: Supabase,
  profileId: string,
  unitIds: readonly string[],
): Promise<void> {
  ok(
    await client.rpc('set_coordinator_units', {
      p_profile_id: profileId,
      p_unit_ids: [...unitIds],
    }),
  );
}

export async function removeCoordinator(client: Supabase, profileId: string): Promise<void> {
  ok(await client.rpc('remove_company_member', { p_profile_id: profileId }));
}

export async function moveVehicle(client: Supabase, vehicleId: string, unitId: string) {
  ok(await client.rpc('move_vehicle_to_unit', { p_vehicle_id: vehicleId, p_unit_id: unitId }));
}

export async function moveOperator(client: Supabase, operatorId: string, unitId: string) {
  ok(await client.rpc('move_operator_to_unit', { p_operator_id: operatorId, p_unit_id: unitId }));
}

export interface IssuedInvitation {
  invitationId: string;
  token: string;
  expiresAt: string;
}

/**
 * Issues an invitation link (create_invitation, G1b): a coordinator to some
 * business units, a new operator to one, or an access reset for an operator
 * with an account. The plain token is returned only here.
 */
export async function issueInvitation(
  client: Supabase,
  invitation:
    | { kind: 'coordinator'; unitIds: readonly string[]; inviteeName?: string | undefined }
    | { kind: 'operator'; unitId: string; inviteeName?: string | undefined }
    | { kind: 'operator_access_reset'; operatorId: string },
): Promise<IssuedInvitation> {
  const args =
    invitation.kind === 'coordinator'
      ? { p_kind: invitation.kind, p_business_unit_ids: [...invitation.unitIds] }
      : invitation.kind === 'operator'
        ? { p_kind: invitation.kind, p_business_unit_ids: [invitation.unitId] }
        : {
            p_kind: invitation.kind,
            p_business_unit_ids: [],
            p_operator_id: invitation.operatorId,
          };
  const name = 'inviteeName' in invitation ? invitation.inviteeName?.trim() : undefined;
  const rows = check(
    await client.rpc('create_invitation', name ? { ...args, p_invitee_name: name } : args),
  );
  const row = rows[0];
  if (!row) throw new Error('create_invitation returned no row');
  return { invitationId: row.invitation_id, token: row.token, expiresAt: row.expires_at };
}
