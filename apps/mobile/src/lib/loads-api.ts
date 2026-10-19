import {
  ACTIVE_TRIP_STATUSES,
  candidateFromRow,
  DEFAULT_ROAD_DISTANCE_FACTOR,
  DEFAULT_TOP_N,
  matchExplanation,
  recommend,
  toRecommendation,
  type CityPreset,
  type NegotiationOffer,
  type Recommendation,
  type Tables,
  type UnitRecommendations,
  type UnitType,
} from '@transport/shared';

import type { Supabase } from './supabase';

// Data access of the carrier's loads screens (B19). Everything goes through
// the user's JWT: RLS shows a carrier the open loads and its own negotiations,
// match_candidates checks that the unit is the caller's, and every offer
// changes only through the negotiation RPCs (B05).

function check<T>({ data, error }: { data: T; error: unknown }): NonNullable<T> {
  if (error) throw error;
  if (data === null || data === undefined) throw new Error('empty response');
  return data;
}

function ok({ error }: { error: unknown }): void {
  if (error) throw error;
}

export type CarrierUnit = Pick<
  Tables<'vehicles'>,
  'id' | 'plate' | 'fleet_number' | 'unit_type' | 'kind'
>;

// Shared with the carrier web since G10a.
export { unitLabel } from '@transport/shared';

/** Units that can carry a load (with a body type), oldest first. */
export async function listCarrierUnits(client: Supabase, companyId: string) {
  return check(
    await client
      .from('vehicles')
      .select('id, plate, fleet_number, unit_type, kind')
      .eq('company_id', companyId)
      .is('archived_at', null)
      .not('unit_type', 'is', null)
      .order('created_at'),
  ) satisfies CarrierUnit[];
}

/** Destination city of each unit with a trip in progress (return-trip mode). */
export async function returnTripCities(client: Supabase): Promise<Map<string, string>> {
  const trips = check(
    await client
      .from('trips')
      .select('vehicle_id, load_id')
      // Same statuses as return-trip mode in match_pairs (B08).
      .in('status', ['assigned', ...ACTIVE_TRIP_STATUSES])
      .not('vehicle_id', 'is', null),
  );
  if (trips.length === 0) return new Map();
  const loads = check(
    await client
      .from('loads')
      .select('id, destination_city')
      .in(
        'id',
        trips.map((t) => t.load_id),
      ),
  );
  const cityByLoad = new Map(loads.map((l) => [l.id, l.destination_city]));
  return new Map(
    trips.flatMap((t) => {
      const city = cityByLoad.get(t.load_id);
      return t.vehicle_id && city ? [[t.vehicle_id, city] as const] : [];
    }),
  );
}

/**
 * Recommendations for one unit from the Edge Function `recommendations`
 * (road distances for the top N). When the function is not reachable (e.g.
 * not served locally) the same candidates are scored here with estimated
 * distances: the ranking is the same pure code (packages/shared/matching).
 */
export async function unitRecommendations(
  client: Supabase,
  vehicleId: string,
): Promise<UnitRecommendations> {
  const { data, error } = await client.functions.invoke<{ recommendations: Recommendation[] }>(
    'recommendations',
    { body: { vehicleId, limit: DEFAULT_TOP_N } },
  );
  if (!error && data && Array.isArray(data.recommendations)) {
    return { vehicleId, recommendations: data.recommendations };
  }
  const rows = check(
    await client.rpc('match_candidates', { p_vehicle_id: vehicleId, p_limit: 200 }),
  );
  const scored = await recommend(rows.map(candidateFromRow), { topN: DEFAULT_TOP_N });
  return {
    vehicleId,
    recommendations: scored.map((m) => toRecommendation(m, matchExplanation(m.breakdown))),
  };
}

/** Road km estimated from a straight line, as the matching does without Routes. */
const estimateFromStraightLine = (km: number) => km * DEFAULT_ROAD_DISTANCE_FACTOR;

export interface EmptyLeg {
  vehicleId: string;
  /** Estimated road km (straight line × road factor) from where the unit is free to the pickup. */
  emptyKm: number;
  start: { city: string; lat: number; lng: number };
}

/**
 * Where each compatible unit is free and how far it is from the pickup of one
 * load (match_candidates, B08), nearest first.
 */
export async function emptyLegs(
  client: Supabase,
  loadId: string,
  units: readonly CarrierUnit[],
): Promise<EmptyLeg[]> {
  const results = await Promise.all(
    units.map(async (unit) => {
      const { data, error } = await client.rpc('match_candidates', {
        p_vehicle_id: unit.id,
        p_limit: 200,
      });
      // A unit that is not ready (documents, availability) has no candidates.
      if (error) return [];
      const row = data.find((r) => r.load_id === loadId);
      if (!row?.start_city || typeof row.empty_km !== 'number') return [];
      if (typeof row.start_lat !== 'number' || typeof row.start_lng !== 'number') return [];
      return [
        {
          vehicleId: unit.id,
          emptyKm: estimateFromStraightLine(row.empty_km),
          start: { city: row.start_city, lat: row.start_lat, lng: row.start_lng },
        },
      ];
    }),
  );
  return results.flat().sort((a, b) => a.emptyKm - b.emptyKm);
}

const LOAD_COLUMNS =
  'id, status, origin_city, origin_state, origin_lat, origin_lng, destination_city, destination_state, destination_lat, destination_lng, pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end, cargo_type, description, weight_kg, volume_m3, unit_type, special_requirements, proposed_price_cents, notes';

export type CarrierLoad = Pick<
  Tables<'loads'>,
  | 'id'
  | 'status'
  | 'origin_city'
  | 'origin_state'
  | 'origin_lat'
  | 'origin_lng'
  | 'destination_city'
  | 'destination_state'
  | 'destination_lat'
  | 'destination_lng'
  | 'pickup_window_start'
  | 'pickup_window_end'
  | 'delivery_window_start'
  | 'delivery_window_end'
  | 'cargo_type'
  | 'description'
  | 'weight_kg'
  | 'volume_m3'
  | 'unit_type'
  | 'special_requirements'
  | 'proposed_price_cents'
  | 'notes'
>;

export interface LoadFilters {
  origin?: CityPreset | undefined;
  destination?: CityPreset | undefined;
  unitType?: UnitType | undefined;
}

/** Open loads (published or negotiating), soonest pickup first. */
export async function searchLoads(client: Supabase, filters: LoadFilters) {
  let query = client
    .from('loads')
    .select(LOAD_COLUMNS)
    .in('status', ['published', 'negotiating'])
    .is('archived_at', null)
    .gt('pickup_window_end', new Date().toISOString());
  if (filters.origin) {
    query = query.eq('origin_city', filters.origin.city).eq('origin_state', filters.origin.state);
  }
  if (filters.destination) {
    query = query
      .eq('destination_city', filters.destination.city)
      .eq('destination_state', filters.destination.state);
  }
  if (filters.unitType) query = query.eq('unit_type', filters.unitType);
  return check(await query.order('pickup_window_start').limit(50)) satisfies CarrierLoad[];
}

export interface CarrierNegotiationSummary {
  negotiationId: string;
  /** Null when the load was contracted with another carrier. */
  load: CarrierLoad | null;
  offers: NegotiationOffer[];
}

const OFFER_COLUMNS =
  'id, negotiation_id, side, amount_cents, conditions, vehicle_id, status, status_reason, created_at';

/** The carrier's negotiations, most recent first. */
export async function listNegotiations(
  client: Supabase,
  companyId: string,
): Promise<CarrierNegotiationSummary[]> {
  const negotiations = check(
    await client
      .from('negotiations')
      .select('id, load_id')
      .eq('carrier_company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(30),
  );
  if (negotiations.length === 0) return [];
  const [loads, offers] = await Promise.all([
    client
      .from('loads')
      .select(LOAD_COLUMNS)
      .in(
        'id',
        negotiations.map((n) => n.load_id),
      ),
    client
      .from('offers')
      .select(OFFER_COLUMNS)
      .in(
        'negotiation_id',
        negotiations.map((n) => n.id),
      ),
  ]);
  const loadById = new Map(check(loads).map((l) => [l.id, l]));
  const allOffers = check(offers);
  // A load another carrier won is no longer visible (loads_select), but the
  // negotiation and its offers are: it stays listed, without the load.
  return negotiations.map((n) => ({
    negotiationId: n.id,
    load: loadById.get(n.load_id) ?? null,
    offers: allOffers.filter((o) => o.negotiation_id === n.id),
  }));
}

export interface LoadNegotiation {
  load: CarrierLoad;
  negotiationId: string | null;
  conversationId: string | null;
  offers: NegotiationOffer[];
}

/** A load with the carrier's negotiation on it, or null when it is not visible. */
export async function loadWithNegotiation(
  client: Supabase,
  companyId: string,
  loadId: string,
): Promise<LoadNegotiation | null> {
  const [load, negotiation] = await Promise.all([
    client.from('loads').select(LOAD_COLUMNS).eq('id', loadId).maybeSingle(),
    client
      .from('negotiations')
      .select('id')
      .eq('load_id', loadId)
      .eq('carrier_company_id', companyId)
      .maybeSingle(),
  ]);
  if (load.error) throw load.error;
  if (negotiation.error) throw negotiation.error;
  if (!load.data) return null;
  const negotiationId = negotiation.data?.id ?? null;
  if (!negotiationId) {
    return { load: load.data, negotiationId, conversationId: null, offers: [] };
  }
  const [offers, conversation] = await Promise.all([
    client.from('offers').select(OFFER_COLUMNS).eq('negotiation_id', negotiationId),
    client.from('conversations').select('id').eq('negotiation_id', negotiationId).maybeSingle(),
  ]);
  if (conversation.error) throw conversation.error;
  return {
    load: load.data,
    negotiationId,
    conversationId: conversation.data?.id ?? null,
    offers: check(offers),
  };
}

export interface OfferInput {
  amountCents: number;
  conditions?: string | undefined;
  vehicleId?: string | undefined;
}

export async function makeOffer(client: Supabase, loadId: string, input: OfferInput) {
  ok(
    await client.rpc('make_offer', {
      p_load_id: loadId,
      p_amount_cents: input.amountCents,
      ...(input.conditions ? { p_conditions: input.conditions } : {}),
      ...(input.vehicleId ? { p_vehicle_id: input.vehicleId } : {}),
    }),
  );
}

export async function counterOffer(client: Supabase, offerId: string, input: OfferInput) {
  ok(
    await client.rpc('counter_offer', {
      p_offer_id: offerId,
      p_amount_cents: input.amountCents,
      ...(input.conditions ? { p_conditions: input.conditions } : {}),
      ...(input.vehicleId ? { p_vehicle_id: input.vehicleId } : {}),
    }),
  );
}

export async function acceptOffer(client: Supabase, offerId: string) {
  ok(await client.rpc('accept_offer', { p_offer_id: offerId }));
}

export async function rejectOffer(client: Supabase, offerId: string) {
  ok(await client.rpc('reject_offer', { p_offer_id: offerId }));
}

export async function withdrawOffer(client: Supabase, offerId: string) {
  ok(await client.rpc('withdraw_offer', { p_offer_id: offerId }));
}

/**
 * Calls `onChange` when an offer of the load changes (Realtime applies the
 * offers select policy, so only the carrier's own negotiation arrives), and
 * each time the channel (re)joins, so changes made while it was disconnected
 * are not missed. Returns the unsubscribe function.
 */
export function watchLoadOffers(client: Supabase, loadId: string, onChange: () => void) {
  const channel = client
    .channel(`carrier-offers:${loadId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'offers', filter: `load_id=eq.${loadId}` },
      onChange,
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onChange();
    });
  return () => void client.removeChannel(channel);
}
