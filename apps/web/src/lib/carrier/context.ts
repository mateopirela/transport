import 'server-only';

import { isManager } from '@transport/shared';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { requireAccess } from '../session';
import { createClient } from '../supabase/server';
import type { Supabase, ViewerDetails } from '../viewer';
import {
  BUSINESS_UNIT_COOKIE,
  resolveBusinessUnitSelection,
  type BusinessUnitOption,
  type BusinessUnitSelection,
} from './business-units';

/** The signed-in carrier staff and what they operate, for a carrier web screen. */
export interface CarrierContext {
  supabase: Supabase;
  viewer: ViewerDetails;
  companyId: string;
  /** The Gerente controls the whole company; a Coordinador only their business units (D19). */
  isManager: boolean;
  units: BusinessUnitSelection;
}

/**
 * Active business units the viewer operates: every one of the company for the
 * Gerente, the assigned ones for a Coordinador (auth_business_unit_ids, G1a).
 * business_units itself is readable by all the company's staff, so the ids
 * from the helper are what narrows it.
 */
async function loadOperableBusinessUnits(
  supabase: Supabase,
  companyId: string,
): Promise<BusinessUnitOption[]> {
  const [ids, units] = await Promise.all([
    supabase.rpc('auth_business_unit_ids'),
    supabase
      .from('business_units')
      .select('id, name')
      .eq('company_id', companyId)
      .is('archived_at', null),
  ]);
  if (ids.error) throw new Error(`Business unit ids query failed: ${ids.error.message}`);
  if (units.error) throw new Error(`Business units query failed: ${units.error.message}`);
  const operable = new Set(ids.data);
  return units.data.filter((unit) => operable.has(unit.id));
}

/**
 * Access check plus the client, company and business unit selection of the
 * carrier staff (access checked by requireAccess: Gerente or Coordinador of
 * an approved carrier). Data access itself is enforced by RLS.
 */
export async function carrierContext(pathname: string): Promise<CarrierContext> {
  const viewer = await requireAccess(pathname);
  const supabase = await createClient();
  if (!supabase || !viewer.company) notFound();
  const companyId = viewer.company.id;
  const [operable, cookieStore] = await Promise.all([
    loadOperableBusinessUnits(supabase, companyId),
    cookies(),
  ]);
  return {
    supabase,
    viewer,
    companyId,
    isManager: isManager(viewer.role),
    units: resolveBusinessUnitSelection(operable, cookieStore.get(BUSINESS_UNIT_COOKIE)?.value),
  };
}
