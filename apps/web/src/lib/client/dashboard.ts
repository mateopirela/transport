import 'server-only';

import { isTripActive, portfolioTotals, toCents, type LoadStatus } from '@transport/shared';

import { loadShipperFreight } from '../freight/queries';
import type { ClientLoadListRow } from '../loads/queries';
import { listCompanyTrips } from '../trips/queries';
import type { Supabase } from '../viewer';
import { clientAttention, routeOf, type PendingOffer } from './attention';

/*
 * The reads of the client's start page (docs/plan-fulmis.md §1.5): only what
 * the client can already read through RLS and the existing RPCs (§0.2), no
 * new query on the server's side.
 */

/** Statuses of a load that is still alive: before it is completed, cancelled or expired. */
const ALIVE: readonly LoadStatus[] = [
  'draft',
  'published',
  'negotiating',
  'contracted',
  'in_progress',
];

/** Loads read for the dashboard: the alive ones, enough for any company of the pilot. */
const ALIVE_LIMIT = 200;

/** Rows of "Cargas activas" and of "Requiere tu atención". */
export const ACTIVE_LOADS_SHOWN = 5;
export const ATTENTION_SHOWN = 6;

const LOAD_COLUMNS =
  'id, status, origin_city, origin_state, destination_city, destination_state, pickup_window_start, unit_type, proposed_price_cents, brokered, brokered_status, created_at';

/** The company's alive loads, newest first (client_loads: the client's price, I6). */
async function aliveLoads(supabase: Supabase, companyId: string) {
  const { data, error } = await supabase
    .rpc('client_loads')
    .select(LOAD_COLUMNS)
    .eq('shipper_company_id', companyId)
    .is('archived_at', null)
    .in('status', ALIVE)
    .order('created_at', { ascending: false })
    .order('id')
    .limit(ALIVE_LIMIT);
  if (error) throw new Error(`Dashboard loads query failed: ${error.message}`);
  return data as unknown as ClientLoadListRow[];
}

/**
 * The carriers' offers waiting for the client (pending, made by a carrier)
 * through the RLS of `offers`, and the carriers' names through
 * load_negotiation_carriers, one call per load that has any.
 */
async function pendingOffers(supabase: Supabase, companyId: string): Promise<PendingOffer[]> {
  const { data, error } = await supabase
    .from('offers')
    .select('id, negotiation_id, load_id, amount_cents, created_at')
    .eq('shipper_company_id', companyId)
    .eq('side', 'carrier')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(ALIVE_LIMIT);
  if (error) throw new Error(`Dashboard offers query failed: ${error.message}`);
  const loadIds = [...new Set(data.map((offer) => offer.load_id))];
  const names = new Map<string, string>();
  await Promise.all(
    loadIds.map(async (loadId) => {
      const carriers = await supabase.rpc('load_negotiation_carriers', { p_load_id: loadId });
      if (carriers.error) throw new Error(`Carriers query failed: ${carriers.error.message}`);
      for (const carrier of carriers.data) {
        names.set(carrier.negotiation_id, carrier.carrier_legal_name);
      }
    }),
  );
  return data.map((offer) => ({
    offerId: offer.id,
    negotiationId: offer.negotiation_id,
    loadId: offer.load_id,
    amountCents: toCents(offer.amount_cents),
    createdAt: offer.created_at,
    carrierName: names.get(offer.negotiation_id) ?? null,
  }));
}

/** Everything the client's start page shows. */
export async function loadClientDashboard(supabase: Supabase, companyId: string) {
  const [loads, offers, trips, freight] = await Promise.all([
    aliveLoads(supabase, companyId),
    pendingOffers(supabase, companyId),
    listCompanyTrips(supabase, companyId, { view: 'active', page: 1 }),
    loadShipperFreight(supabase),
  ]);

  const attention = clientAttention({
    offers,
    loads,
    trips: trips.rows.map((trip) => ({
      id: trip.id,
      status: trip.status,
      route: trip.load ? routeOf(trip.load) : null,
    })),
    freight,
  });
  const offerItems = attention.filter((item) => item.kind === 'offer');
  const market = loads.filter(
    (load) => load.status === 'published' || load.status === 'negotiating',
  );
  // The trip to follow: the newest one on the road, else the newest still open.
  const currentTrip =
    trips.rows.find((trip) => isTripActive(trip.status)) ??
    trips.rows.find((trip) => trip.status !== 'delivered') ??
    null;

  return {
    kpis: {
      offers: offerItems.length,
      offerLoads: new Set(offerItems.map((item) => item.loadId)).size,
      published: market.length,
      // A published load without pending offers (negotiating means it has some).
      waiting: market.filter((load) => load.status === 'published').length,
      trips: trips.total,
      toConfirm: trips.rows.filter((trip) => trip.status === 'delivered').length,
    },
    totals: portfolioTotals(
      freight.map((row) => ({ status: row.status, pendingCents: row.pending_cents })),
    ),
    attention,
    activeLoads: loads.filter((load) => load.status !== 'draft').slice(0, ACTIVE_LOADS_SHOWN),
    activeLoadsTotal: loads.filter((load) => load.status !== 'draft').length,
    currentTrip,
  };
}

export type ClientDashboard = Awaited<ReturnType<typeof loadClientDashboard>>;
