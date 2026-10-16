import 'server-only';

import { uuidField } from '@transport/shared';
import { notFound } from 'next/navigation';

import { requireAccess } from '../session';
import { createClient } from '../supabase/server';
import type { Supabase } from '../viewer';
import { cityFilter, type IncidentFilters, type LoadFilters, type TripFilters } from './filters';

/** The admin's client for a supervision screen (access checked). */
export async function adminContext(pathname: string) {
  await requireAccess(pathname);
  const supabase = await createClient();
  if (!supabase) notFound();
  return supabase;
}

/** Rows per page of the supervision lists. */
export const ADMIN_PAGE_SIZE = 25;

const ROUTE = 'origin_city, origin_state, destination_city, destination_state';

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Admin ${what} query failed: ${result.error.message}`);
  return result.data as T;
}

const range = (page: number) => {
  const from = (page - 1) * ADMIN_PAGE_SIZE;
  return [from, from + ADMIN_PAGE_SIZE - 1] as const;
};

/** Legal names of some companies (admins read every company through RLS). */
async function companyNames(supabase: Supabase, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, string>();
  const rows = check(
    await supabase.from('companies').select('id, legal_name').in('id', unique),
    'companies',
  );
  return new Map(rows.map((row) => [row.id, row.legal_name]));
}

/** Every load of the platform, newest first, filtered by status and city. */
export async function listAdminLoads(supabase: Supabase, filters: LoadFilters) {
  let query = supabase
    .from('loads')
    .select(
      `id, status, ${ROUTE}, pickup_window_start, proposed_price_cents, agreed_price_cents,
       shipper:companies!loads_shipper_company_id_fkey(legal_name),
       carrier:companies!loads_carrier_company_id_fkey(legal_name)`,
      { count: 'exact' },
    )
    .is('archived_at', null);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.city) query = query.or(cityFilter(filters.city));
  const result = await query
    .order('created_at', { ascending: false })
    .order('id')
    .range(...range(filters.page));
  return { rows: check(result, 'loads'), total: result.count ?? 0 };
}

/** PostgREST caps each response; offers are read in pages of this size. */
const OFFERS_PAGE_SIZE = 1000;

/** Every offer of a load, newest first, in pages so a long history is never cut short. */
async function listAllLoadOffers(supabase: Supabase, loadId: string) {
  const offers = [];
  for (let from = 0; ; from += OFFERS_PAGE_SIZE) {
    const page = check(
      await supabase
        .from('offers')
        .select(
          'id, side, amount_cents, conditions, status, carrier_company_id, created_by, created_at',
        )
        .eq('load_id', loadId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, from + OFFERS_PAGE_SIZE - 1),
      'offers',
    );
    offers.push(...page);
    if (page.length < OFFERS_PAGE_SIZE) return offers;
  }
}

/** A load with its offers (and who made them) and its trip, or null. */
export async function getAdminLoad(supabase: Supabase, loadId: string) {
  if (!uuidField.safeParse(loadId).success) return null;
  const { data: load, error } = await supabase
    .from('loads')
    .select(
      `id, status, ${ROUTE}, pickup_window_start, proposed_price_cents, agreed_price_cents,
       shipper:companies!loads_shipper_company_id_fkey(legal_name),
       carrier:companies!loads_carrier_company_id_fkey(legal_name)`,
    )
    .eq('id', loadId)
    .maybeSingle();
  if (error) throw new Error(`Admin load query failed: ${error.message}`);
  if (!load) return null;
  const [offerRows, trip] = await Promise.all([
    listAllLoadOffers(supabase, load.id),
    supabase.from('trips').select('id, status').eq('load_id', load.id).maybeSingle(),
  ]);
  const [names, admins] = await Promise.all([
    companyNames(
      supabase,
      offerRows.map((o) => o.carrier_company_id),
    ),
    adminIds(
      supabase,
      offerRows.flatMap((o) => (o.created_by ? [o.created_by] : [])),
    ),
  ]);
  return {
    load,
    trip: check(trip, 'trip'),
    offers: offerRows.map((offer) => ({
      ...offer,
      carrierName: names.get(offer.carrier_company_id) ?? '',
      byAdmin: offer.created_by !== null && admins.has(offer.created_by),
    })),
  };
}

/** Which of these users are admins (offers made on behalf of a party). */
async function adminIds(supabase: Supabase, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set<string>();
  const rows = check(
    await supabase.from('profiles').select('id').in('id', unique).eq('role', 'admin'),
    'profiles',
  );
  return new Set(rows.map((row) => row.id));
}

/** Approved carriers, for the manual contract form. */
export async function listApprovedCarriers(supabase: Supabase) {
  return check(
    await supabase
      .from('companies')
      .select('id, legal_name')
      .eq('type', 'carrier')
      .eq('status', 'approved')
      .is('archived_at', null)
      .order('legal_name')
      .limit(500),
    'carriers',
  );
}

/** Every trip, newest first, with its route, parties and open incidents. */
export async function listAdminTrips(supabase: Supabase, filters: TripFilters) {
  let query = supabase
    .from('trips')
    .select(
      `id, load_id, status, created_at,
       load:loads!trips_load_id_fkey(${ROUTE}, pickup_window_start),
       shipper:companies!trips_shipper_company_id_fkey(legal_name),
       carrier:companies!trips_carrier_company_id_fkey(legal_name),
       incidents(id)`,
      { count: 'exact' },
    )
    .eq('incidents.status', 'open');
  if (filters.status) query = query.eq('status', filters.status);
  const result = await query
    .order('created_at', { ascending: false })
    .order('id')
    .range(...range(filters.page));
  return { rows: check(result, 'trips'), total: result.count ?? 0 };
}

/** Incidents by status (open: oldest first, so nothing waits forever). */
export async function listAdminIncidents(supabase: Supabase, filters: IncidentFilters) {
  const result = await supabase
    .from('incidents')
    .select(
      `id, trip_id, kind, description, status, occurred_at, reporter_role, resolution, resolved_at,
       trip:trips!incidents_trip_id_fkey(load_id, load:loads!trips_load_id_fkey(${ROUTE}))`,
      { count: 'exact' },
    )
    .eq('status', filters.status)
    .order('created_at', { ascending: filters.status === 'open' })
    .order('id')
    .range(...range(filters.page));
  return { rows: check(result, 'incidents'), total: result.count ?? 0 };
}

/** The one-row pilot summary (kpi_pilot_summary), or null if it is empty. */
export async function loadPilotSummary(supabase: Supabase) {
  return check(await supabase.from('kpi_pilot_summary').select('*').maybeSingle(), 'kpi');
}
