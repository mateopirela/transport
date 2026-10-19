'use server';

import {
  authErrors,
  fleetErrorText,
  invitationUrl,
  managerCompanyCopy,
  managerCompanyErrorCopy,
  managerCompanyErrorText,
  uuidField,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { siteUrl } from '../env';
import type { FormState } from '../forms';
import { withParams } from '../pagination';
import { paths } from '../routing';
import type { CompanyFlash } from './company';
import { FLEET_FLASH_PARAM } from './fleet-forms';
import { createClient } from '../supabase/server';

// Server actions of "Mi empresa" (G4) and of the invitation links of the
// fleet screens. Every write is an RPC that checks the caller in Postgres:
// the manager RPCs (…_manager_company.sql) only for the Gerente, and
// create_invitation / revoke_invitation (G1b) for the Gerente or the
// Coordinador of the business unit. Nothing here decides who may do what.

const c = managerCompanyCopy;
const notConfigured: FormState = { error: authErrors.notConfigured };

function uuidOf(formData: FormData, name: string): string | null {
  const parsed = uuidField.safeParse(formData.get(name));
  return parsed.success ? parsed.data : null;
}

function uuidsOf(formData: FormData, name: string): string[] {
  return formData.getAll(name).flatMap((value) => {
    const parsed = uuidField.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Spanish message for a known error of these RPCs; never the database text. */
function companyError(error: { message?: string | null }): string {
  const message = error.message ?? '';
  return (
    managerCompanyErrorText(message) ?? fleetErrorText(message) ?? managerCompanyErrorCopy.generic
  );
}

async function rpcState(
  call: (supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>) => PromiseLike<{
    error: { message?: string | null } | null;
  }>,
  success: string,
): Promise<FormState> {
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await call(supabase);
  if (error) return { error: companyError(error) };
  // Lists, pickers and the fleet screens all change.
  revalidatePath(paths.carrier, 'layout');
  return { message: success };
}

// ---------------------------------------------------------------------------
// Business units
// ---------------------------------------------------------------------------

export async function createBusinessUnitAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get('name') ?? '');
  const state = await rpcState(
    (supabase) => supabase.rpc('create_business_unit', { p_name: name }),
    c.businessUnits.created,
  );
  return state.error ? { ...state, values: { name } } : state;
}

export async function renameBusinessUnitAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = uuidOf(formData, 'businessUnitId');
  if (!id) return { error: managerCompanyErrorCopy.businessUnitNotFound };
  const name = String(formData.get('name') ?? '');
  return rpcState(
    (supabase) => supabase.rpc('rename_business_unit', { p_id: id, p_name: name }),
    c.businessUnits.renamed,
  );
}

export async function archiveBusinessUnitAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = uuidOf(formData, 'businessUnitId');
  if (!id) return { error: managerCompanyErrorCopy.businessUnitNotFound };
  return rpcState(
    (supabase) => supabase.rpc('archive_business_unit', { p_id: id }),
    c.businessUnits.archived,
  );
}

// ---------------------------------------------------------------------------
// Coordinators
// ---------------------------------------------------------------------------

export async function setCoordinatorUnitsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profileId = uuidOf(formData, 'profileId');
  if (!profileId) return { error: managerCompanyErrorCopy.coordinatorNotFound };
  const unitIds = uuidsOf(formData, 'unitIds');
  if (unitIds.length === 0) return { error: managerCompanyErrorCopy.unitsRequired };
  return rpcState(
    (supabase) =>
      supabase.rpc('set_coordinator_units', { p_profile_id: profileId, p_unit_ids: unitIds }),
    c.coordinators.unitsSaved,
  );
}

export async function removeCoordinatorAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profileId = uuidOf(formData, 'profileId');
  if (!profileId) return { error: managerCompanyErrorCopy.coordinatorNotFound };
  return rpcState(
    (supabase) => supabase.rpc('remove_company_member', { p_profile_id: profileId }),
    c.coordinators.removed,
  );
}

// ---------------------------------------------------------------------------
// Moving units and operators
// ---------------------------------------------------------------------------

// The row changes group (or leaves the list) and its form is remounted, so a
// move or an archive redirects with its notice (COMPANY_FLASH) instead of
// returning it.
function companyFlash(key: CompanyFlash): never {
  revalidatePath(paths.carrier, 'layout');
  redirect(withParams(paths.carrierCompany, {}, { [FLEET_FLASH_PARAM]: key }));
}

export async function moveFleetRowAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuidOf(formData, 'id');
  const unitId = uuidOf(formData, 'businessUnitId');
  if (!id) return { error: managerCompanyErrorCopy.notFound };
  if (!unitId) return { error: managerCompanyErrorCopy.businessUnitNotFound };
  const kind = formData.get('kind');
  if (kind !== 'vehicle' && kind !== 'operator') return { error: managerCompanyErrorCopy.notFound };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } =
    kind === 'vehicle'
      ? await supabase.rpc('move_vehicle_to_unit', { p_vehicle_id: id, p_unit_id: unitId })
      : await supabase.rpc('move_operator_to_unit', { p_operator_id: id, p_unit_id: unitId });
  if (error) return { error: companyError(error) };
  companyFlash('movido');
}

/**
 * Archives (da de baja) a unit or an operator from "Mi empresa": the
 * archived_at update of B06, which only the Gerente may make
 * (fleet_guard_business_unit) and which fleet_block_archive_with_trips
 * refuses while a trip is in its hands.
 */
export async function archiveFleetRowAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = uuidOf(formData, 'id');
  const kind = formData.get('kind');
  if (!id || (kind !== 'vehicle' && kind !== 'operator')) {
    return { error: managerCompanyErrorCopy.notFound };
  }
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from(kind === 'vehicle' ? 'vehicles' : 'operators')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .is('archived_at', null)
    .select('id')
    .maybeSingle();
  if (error) return { error: companyError(error) };
  if (!data) return { error: managerCompanyErrorCopy.notFound };
  companyFlash(kind === 'vehicle' ? 'baja-unidad' : 'baja-operador');
}

// ---------------------------------------------------------------------------
// Invitation links
// ---------------------------------------------------------------------------

/** State of an invitation form: the link to share, shown only once. */
export interface InvitationLinkState {
  error?: string;
  link?: string;
  expiresAt?: string;
}

/**
 * Issues a single-use invitation link (create_invitation): `coordinator` to
 * one or more business units (the Gerente), `operator` for a new operator of
 * one business unit or for an operator row without an account, or
 * `operator_access_reset` for an operator with an account (the Gerente or the
 * Coordinador of its business unit). The plain token only travels in this
 * response; the database keeps its hash.
 */
export async function issueInvitationAction(
  _prev: InvitationLinkState,
  formData: FormData,
): Promise<InvitationLinkState> {
  const kind = formData.get('kind');
  const unitIds = uuidsOf(formData, 'unitIds');
  const operatorId = uuidOf(formData, 'operatorId');
  const inviteeName = String(formData.get('inviteeName') ?? '').trim();
  let args: {
    p_kind: 'coordinator' | 'operator' | 'operator_access_reset';
    p_business_unit_ids: string[];
    p_operator_id?: string;
    p_invitee_name?: string;
  };
  if (kind === 'coordinator' || (kind === 'operator' && !operatorId)) {
    if (unitIds.length === 0) return { error: managerCompanyErrorCopy.unitsRequired };
    args = { p_kind: kind, p_business_unit_ids: unitIds };
    if (inviteeName) args.p_invitee_name = inviteeName;
  } else if ((kind === 'operator' || kind === 'operator_access_reset') && operatorId) {
    args = { p_kind: kind, p_business_unit_ids: [], p_operator_id: operatorId };
  } else {
    return { error: managerCompanyErrorCopy.generic };
  }

  const supabase = await createClient();
  if (!supabase) return { error: authErrors.notConfigured };
  const { data, error } = await supabase.rpc('create_invitation', args);
  if (error) return { error: companyError(error) };
  const row = data[0];
  if (!row) return { error: managerCompanyErrorCopy.generic };
  revalidatePath(paths.carrier, 'layout');
  const origin = (await headers()).get('origin');
  return { link: invitationUrl(siteUrl(origin), row.token), expiresAt: row.expires_at };
}

export async function revokeInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = uuidOf(formData, 'invitationId');
  if (!id) return { error: managerCompanyErrorCopy.generic };
  return rpcState(
    (supabase) => supabase.rpc('revoke_invitation', { p_invitation_id: id }),
    c.invitations.revoked,
  );
}
