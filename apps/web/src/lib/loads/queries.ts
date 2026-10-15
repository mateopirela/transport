import 'server-only';

import { roadDistanceFactor, uuidField, type LoadStatus } from '@transport/shared';
import { notFound } from 'next/navigation';

import { requireAccess } from '../session';
import { createClient } from '../supabase/server';
import type { Supabase } from '../viewer';

/** The signed-in shipper's client and company for a loads screen (access checked). */
export async function shipperContext(pathname: string) {
  const viewer = await requireAccess(pathname);
  const supabase = await createClient();
  if (!supabase || !viewer.company) notFound();
  return { supabase, companyId: viewer.company.id };
}

/** ROAD_DISTANCE_FACTOR for the distance estimate (server env, with a default). */
export function serverRoadFactor(): number {
  return roadDistanceFactor(process.env.ROAD_DISTANCE_FACTOR);
}

/** Rows per page of the loads list. */
export const LOADS_PAGE_SIZE = 25;

const LIST_COLUMNS =
  'id, status, origin_city, origin_state, destination_city, destination_state, pickup_window_start, unit_type, proposed_price_cents';

/**
 * The company's loads, newest first. RLS already limits a shipper to its own
 * loads; filtering by company keeps the query explicit and indexed.
 */
export async function listCompanyLoads(
  supabase: Supabase,
  companyId: string,
  { status, page }: { status: LoadStatus | null; page: number },
) {
  const from = (page - 1) * LOADS_PAGE_SIZE;
  let query = supabase
    .from('loads')
    .select(LIST_COLUMNS, { count: 'exact' })
    .eq('shipper_company_id', companyId)
    .is('archived_at', null);
  if (status) query = query.eq('status', status);
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, from + LOADS_PAGE_SIZE - 1);
  if (error) throw new Error(`Loads query failed: ${error.message}`);
  return { rows: data, total: count ?? data.length };
}

/** One load of the company, or null when it does not exist or is not theirs. */
export async function getCompanyLoad(supabase: Supabase, companyId: string, loadId: string) {
  // A malformed id from the URL is "not found", not a database error.
  if (!uuidField.safeParse(loadId).success) return null;
  const { data, error } = await supabase
    .from('loads')
    .select('*')
    .eq('id', loadId)
    .eq('shipper_company_id', companyId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw new Error(`Load query failed: ${error.message}`);
  return data;
}
