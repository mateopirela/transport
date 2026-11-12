import 'server-only';

import {
  isTripActive,
  portfolioTotals,
  toCents,
  type LoadStatus,
  type TripStatus,
} from '@transport/shared';

import { loadShipperFreight } from '../freight/queries';
import type { ClientLoadListRow } from '../loads/queries';
import { FINISHED_TRIP_STATUSES } from '../trips/tracking';
import type { Supabase } from '../viewer';
import { clientAttention, routeOf, type PendingOffer } from './attention';

/*
 * The reads of the client's start page (docs/plan-fulmis.md §1.5): only what
 * the client can already read through RLS and the existing RPCs (§0.2), no
 * new query on the server's side. Every list is read whole, in pages, so an
 * old load, offer or trip that waits for the client is never left out.
 */

/** Statuses of a load that is still alive: before it is completed, cancelled or expired. */
const ALIVE: readonly LoadStatus[] = [
  'draft',
  'published',
  'negotiating',
  'contracted',
  'in_progress',
];

/** Rows per request; PostgREST caps a response (1,000 by default). */
const PAGE_SIZE = 1000;

/** Rows of "Cargas activas" and of "Requiere tu atención". */
export const ACTIVE_LOADS_SHOWN = 5;
export const ATTENTION_SHOWN = 6;

const LOAD_COLUMNS =
  'id, status, origin_city, origin_state, destination_city, destination_state, pickup_window_start, unit_type, proposed_price_cents, brokered, brokered_status, created_at';

/** Every row of a query, page after page, until a short page. */
async function allPages<T>(
  name: string,
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Dashboard ${name} query failed: ${error.message}`);
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
}

/** The company's alive loads, newest first (client_loads: the client's price, I6). */
function aliveLoads(supabase: Supabase, companyId: string) {
  return allPages<ClientLoadListRow>('loads', (from, to) =>
    supabase
      .rpc('client_loads')
      .select(LOAD_COLUMNS)
      .eq('shipper_company_id', companyId)
      .is('archived_at', null)
      .in('status', ALIVE)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  );
}

interface OfferRow {
  id: string;
  negotiation_id: string;
  load_id: string;
  amount_cents: number;
  created_at: string;
}

/**
 * The carriers' offers waiting for the client (pending, made by a carrier)
 * through the RLS of `offers`, and the carriers' names through
 * load_negotiation_carriers, one call per load that has any.
 */
async function pendingOffers(supabase: Supabase, companyId: string): Promise<PendingOffer[]> {
  const offers = await allPages<OfferRow>('offers', (from, to) =>
    supabase
      .from('offers')
      .select('id, negotiation_id, load_id, amount_cents, created_at')
      .eq('shipper_company_id', companyId)
      .eq('side', 'carrier')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  );
  const loadIds = [...new Set(offers.map((offer) => offer.load_id))];
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
  return offers.map((offer) => ({
    offerId: offer.id,
    negotiationId: offer.negotiation_id,
    loadId: offer.load_id,
    amountCents: toCents(offer.amount_cents),
    createdAt: offer.created_at,
    carrierName: names.get(offer.negotiation_id) ?? null,
  }));
}

interface TripRow {
  id: string;
  status: TripStatus;
  load_id: string;
}

/** The company's trips that are not finished (closed or cancelled), newest first. */
function openTrips(supabase: Supabase, companyId: string) {
  const finished = `(${FINISHED_TRIP_STATUSES.join(',')})`;
  return allPages<TripRow>('trips', (from, to) =>
    supabase
      .from('trips')
      .select('id, status, load_id')
      .eq('shipper_company_id', companyId)
      .not('status', 'in', finished)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  );
}

interface TripLoadRoute {
  id: string;
  origin_city: string;
  destination_city: string;
}

/** The routes of some trips' loads, from client_loads (I6). */
async function tripRoutes(supabase: Supabase, loadIds: string[]) {
  const routes = new Map<string, TripLoadRoute>();
  if (loadIds.length === 0) return routes;
  const { data, error } = await supabase
    .rpc('client_loads')
    .select('id, origin_city, destination_city')
    .in('id', loadIds);
  if (error) throw new Error(`Dashboard trip loads query failed: ${error.message}`);
  for (const row of data as unknown as TripLoadRoute[]) routes.set(row.id, row);
  return routes;
}

/** The carrier of one trip (shipper_trip_parties), or null. */
async function tripCarrier(supabase: Supabase, tripId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('shipper_trip_parties', { p_trip_ids: [tripId] });
  if (error) throw new Error(`Dashboard trip parties query failed: ${error.message}`);
  return data[0]?.carrier_legal_name ?? null;
}

/** Everything the client's start page shows. */
export async function loadClientDashboard(supabase: Supabase, companyId: string) {
  const [loads, offers, trips, freight] = await Promise.all([
    aliveLoads(supabase, companyId),
    pendingOffers(supabase, companyId),
    openTrips(supabase, companyId),
    loadShipperFreight(supabase),
  ]);

  // The trip to follow: the newest one on the road, else the newest still open.
  const current =
    trips.find((trip) => isTripActive(trip.status)) ??
    trips.find((trip) => trip.status !== 'delivered') ??
    null;
  const delivered = trips.filter((trip) => trip.status === 'delivered');
  const [routes, carrierName] = await Promise.all([
    tripRoutes(supabase, [
      ...new Set([...delivered, ...(current ? [current] : [])].map((trip) => trip.load_id)),
    ]),
    current ? tripCarrier(supabase, current.id) : null,
  ]);
  const routeOfTrip = (trip: TripRow) => {
    const load = routes.get(trip.load_id);
    return load ? routeOf(load) : null;
  };

  const attention = clientAttention({
    offers,
    loads,
    trips: delivered.map((trip) => ({
      id: trip.id,
      status: trip.status,
      route: routeOfTrip(trip),
    })),
    freight,
  });
  const offerItems = attention.filter((item) => item.kind === 'offer');
  const market = loads.filter(
    (load) => load.status === 'published' || load.status === 'negotiating',
  );
  const alive = loads.filter((load) => load.status !== 'draft');

  return {
    kpis: {
      offers: offerItems.length,
      offerLoads: new Set(offerItems.map((item) => item.loadId)).size,
      published: market.length,
      // A published load without pending offers (negotiating means it has some).
      waiting: market.filter((load) => load.status === 'published').length,
      trips: trips.length,
      toConfirm: delivered.length,
    },
    totals: portfolioTotals(
      freight.map((row) => ({ status: row.status, pendingCents: row.pending_cents })),
    ),
    attention,
    activeLoads: alive.slice(0, ACTIVE_LOADS_SHOWN),
    activeLoadsTotal: alive.length,
    currentTrip: current && {
      id: current.id,
      status: current.status,
      route: routeOfTrip(current),
      carrierName,
    },
  };
}

export type ClientDashboard = Awaited<ReturnType<typeof loadClientDashboard>>;
