import 'server-only';

import {
  ACTIVE_TRIP_STATUSES,
  buildCarrierFeed,
  candidateFromRow,
  carrierNegotiationState,
  DEFAULT_ROAD_DISTANCE_FACTOR,
  DEFAULT_TOP_N,
  estimateRoadKm,
  findCityPreset,
  matchExplanation,
  recommend,
  toRecommendation,
  uuidField,
  type CarrierFeed,
  type CarrierNegotiationState,
  type NegotiationOffer,
  type Recommendation,
  type Tables,
  type UnitRecommendations,
} from '@transport/shared';

import type { Supabase } from '../viewer';
import type { LoadSearchFilters } from './filters';

// Data access of the carrier web's loads and negotiation screens (G10a), the
// same reads as apps/mobile/src/lib/loads-api.ts (B19), through the user's
// JWT: RLS shows the staff the open loads and the negotiations of their
// business units, match_candidates only answers for their own units, and
// every offer changes only through the negotiation RPCs (actions.ts).

function check<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error) throw new Error(error.message);
  if (data === null || data === undefined) throw new Error('empty response');
  return data;
}

export type CarrierUnit = Pick<
  Tables<'vehicles'>,
  | 'id'
  | 'plate'
  | 'fleet_number'
  | 'unit_type'
  | 'kind'
  | 'business_unit_id'
  | 'capacity_kg'
  | 'features'
>;

/**
 * Units that can carry a load (with a body type) of the given business units,
 * oldest first. RLS already limits a Coordinador to their units; the filter
 * applies the picker's selection.
 */
export async function listCarrierUnits(
  supabase: Supabase,
  companyId: string,
  businessUnitIds: readonly string[],
): Promise<CarrierUnit[]> {
  if (businessUnitIds.length === 0) return [];
  return check(
    await supabase
      .from('vehicles')
      .select('id, plate, fleet_number, unit_type, kind, business_unit_id, capacity_kg, features')
      .eq('company_id', companyId)
      .in('business_unit_id', [...businessUnitIds])
      .is('archived_at', null)
      .not('unit_type', 'is', null)
      .order('created_at'),
  );
}

/** Destination city of each unit with a trip in progress (return-trip mode). */
async function returnTripCities(supabase: Supabase): Promise<Map<string, string>> {
  const trips = check(
    await supabase
      .from('trips')
      .select('vehicle_id, load_id')
      // Same statuses as return-trip mode in match_pairs (B08).
      .in('status', ['assigned', ...ACTIVE_TRIP_STATUSES])
      .not('vehicle_id', 'is', null),
  );
  if (trips.length === 0) return new Map();
  const loads = check(
    await supabase
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
async function unitRecommendations(
  supabase: Supabase,
  vehicleId: string,
): Promise<UnitRecommendations> {
  const { data, error } = await supabase.functions.invoke<{ recommendations: Recommendation[] }>(
    'recommendations',
    { body: { vehicleId, limit: DEFAULT_TOP_N } },
  );
  if (!error && data && Array.isArray(data.recommendations)) {
    return { vehicleId, recommendations: data.recommendations };
  }
  const rows = check(
    await supabase.rpc('match_candidates', { p_vehicle_id: vehicleId, p_limit: 200 }),
  );
  const scored = await recommend(rows.map(candidateFromRow), { topN: DEFAULT_TOP_N });
  return {
    vehicleId,
    recommendations: scored.map((m) => toRecommendation(m, matchExplanation(m.breakdown))),
  };
}

/** Home feed (B19): return trips of the units in a trip, then the best unit per load. */
export async function carrierFeed(
  supabase: Supabase,
  units: readonly CarrierUnit[],
): Promise<CarrierFeed> {
  const [perUnit, cities] = await Promise.all([
    Promise.all(units.map((u) => unitRecommendations(supabase, u.id))),
    returnTripCities(supabase),
  ]);
  return buildCarrierFeed(perUnit, cities);
}

/** Road km estimated from a straight line, as the matching does without Routes. */
const estimateFromStraightLine = (km: number) => km * DEFAULT_ROAD_DISTANCE_FACTOR;

export interface EmptyLeg {
  vehicleId: string;
  /** Estimated road km (straight line × road factor) from where the unit is free to the pickup. */
  emptyKm: number;
  start: { city: string; lat: number; lng: number };
  /**
   * `matching`: the unit passed every check of match_pairs (B08: ready,
   * compatible and free in time), so it may be proposed by default.
   * `availability`: an estimate from the unit's availability for a load the
   * matching does not list (already negotiated, beyond its radius or its
   * limit); shown, never proposed by default. Not given for a unit committed
   * to a trip: the matching starts it where its chain of trips ends, which
   * its manual availability does not reflect.
   */
  source: 'matching' | 'availability';
}

/**
 * Where each unit of the load's unit type is free and how far it is from the
 * pickup: from match_candidates (B08) when it lists the load, and otherwise
 * (the company already negotiates it, or it is beyond the matching's radius
 * or limit) from the unit's availability and the pickup, as the matching
 * estimates without Routes, unless the unit is committed to a trip. Nearest
 * first.
 */
export async function emptyLegs(
  supabase: Supabase,
  load: Pick<
    CarrierLoad,
    | 'id'
    | 'unit_type'
    | 'weight_kg'
    | 'special_requirements'
    | 'pickup_window_end'
    | 'origin_lat'
    | 'origin_lng'
  >,
  units: readonly CarrierUnit[],
): Promise<EmptyLeg[]> {
  // The same compatibility as match_pairs (B08): unit type, capacity and features.
  const compatible = units.filter(
    (unit) =>
      unit.unit_type === load.unit_type &&
      unit.capacity_kg !== null &&
      load.weight_kg <= unit.capacity_kg &&
      load.special_requirements.every((r) => unit.features.includes(r)),
  );
  if (compatible.length === 0) return [];
  // Free in time, as match_pairs requires.
  const [availability, committed] = await Promise.all([
    supabase
      .from('vehicle_availability')
      .select('vehicle_id, city, state, available_from')
      .in(
        'vehicle_id',
        compatible.map((unit) => unit.id),
      )
      .is('archived_at', null)
      .lte('available_from', load.pickup_window_end),
    // The trips vehicle_trip_chain_end (F5) chains: the unit's assigned or
    // active trips, and those pending assignment whose offer named it.
    supabase
      .from('trips')
      .select('vehicle_id, offers(vehicle_id)')
      .in('status', ['pending_assignment', 'assigned', ...ACTIVE_TRIP_STATUSES]),
  ]);
  const freeAt = new Map(check(availability).map((a) => [a.vehicle_id, a]));
  const booked = new Set(
    check(committed).flatMap((t) => {
      const unit = t.vehicle_id ?? t.offers?.vehicle_id ?? null;
      return unit ? [unit] : [];
    }),
  );
  const results = await Promise.all(
    compatible.map(async (unit): Promise<EmptyLeg[]> => {
      const { data, error } = await supabase.rpc('match_candidates', {
        p_vehicle_id: unit.id,
        p_limit: 200,
      });
      // A unit that is not ready (documents, availability) has no candidates.
      const row = error ? undefined : data.find((r) => r.load_id === load.id);
      if (
        row?.start_city &&
        typeof row.empty_km === 'number' &&
        typeof row.start_lat === 'number' &&
        typeof row.start_lng === 'number'
      ) {
        return [
          {
            vehicleId: unit.id,
            emptyKm: estimateFromStraightLine(row.empty_km),
            start: { city: row.start_city, lat: row.start_lat, lng: row.start_lng },
            source: 'matching',
          },
        ];
      }
      // A booked unit starts where its trips end, not at its availability.
      if (booked.has(unit.id)) return [];
      // Availability is stored as a city preset (B18), so its coordinates are known.
      const free = freeAt.get(unit.id);
      const place = free && findCityPreset(free.city, free.state);
      if (!place) return [];
      const start = { city: place.city, lat: place.lat, lng: place.lng };
      const pickup = { lat: load.origin_lat, lng: load.origin_lng };
      return [
        {
          vehicleId: unit.id,
          emptyKm: estimateRoadKm(start, pickup),
          start,
          source: 'availability',
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

/** Rows per page of the load search and the negotiations list. */
export const CARRIER_PAGE_SIZE = 25;

/** Open loads (published or negotiating) with a pickup still ahead, soonest pickup first. */
export async function searchLoads(
  supabase: Supabase,
  filters: LoadSearchFilters,
  page: number,
): Promise<{ rows: CarrierLoad[]; total: number }> {
  const from = (page - 1) * CARRIER_PAGE_SIZE;
  let query = supabase
    .from('loads')
    .select(LOAD_COLUMNS, { count: 'exact' })
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
  const { data, count, error } = await query
    .order('pickup_window_start')
    .order('id')
    .range(from, from + CARRIER_PAGE_SIZE - 1);
  if (error) throw new Error(`Loads query failed: ${error.message}`);
  return { rows: data, total: count ?? data.length };
}

/** A load as the carrier staff may see it (loads_select), or null. */
export async function getCarrierLoad(supabase: Supabase, loadId: string) {
  // A malformed id from the URL is "not found", not a database error.
  if (!uuidField.safeParse(loadId).success) return null;
  const { data, error } = await supabase
    .from('loads')
    .select(LOAD_COLUMNS)
    .eq('id', loadId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw new Error(`Load query failed: ${error.message}`);
  return data;
}

const OFFER_COLUMNS =
  'id, negotiation_id, side, amount_cents, conditions, vehicle_id, status, status_reason, created_at';

/** The company's negotiation on a load, as RLS shows it to the viewer. */
export interface CarrierNegotiation {
  id: string;
  loadId: string;
  businessUnitId: string;
  updatedAt: string;
  conversationId: string | null;
  offers: NegotiationOffer[];
}

async function negotiationDetails(
  supabase: Supabase,
  negotiation: { id: string; load_id: string; business_unit_id: string; updated_at: string },
): Promise<CarrierNegotiation> {
  const [offers, conversation] = await Promise.all([
    supabase.from('offers').select(OFFER_COLUMNS).eq('negotiation_id', negotiation.id),
    supabase.from('conversations').select('id').eq('negotiation_id', negotiation.id).maybeSingle(),
  ]);
  if (conversation.error)
    throw new Error(`Conversation query failed: ${conversation.error.message}`);
  return {
    id: negotiation.id,
    loadId: negotiation.load_id,
    businessUnitId: negotiation.business_unit_id,
    updatedAt: negotiation.updated_at,
    conversationId: conversation.data?.id ?? null,
    offers: check(offers),
  };
}

const NEGOTIATION_COLUMNS = 'id, load_id, business_unit_id, updated_at';

/**
 * The company's negotiation on a load, or null when there is none the viewer
 * may see. One exists per load and company (negotiations_load_carrier_key);
 * a Coordinador of another business unit does not see it, and make_offer
 * tells them another unit already negotiates the load.
 */
export async function getLoadNegotiation(
  supabase: Supabase,
  companyId: string,
  loadId: string,
): Promise<CarrierNegotiation | null> {
  // A malformed id from the URL is "not found", not a database error.
  if (!uuidField.safeParse(loadId).success) return null;
  const { data, error } = await supabase
    .from('negotiations')
    .select(NEGOTIATION_COLUMNS)
    .eq('load_id', loadId)
    .eq('carrier_company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(`Negotiation query failed: ${error.message}`);
  return data ? negotiationDetails(supabase, data) : null;
}

/**
 * One negotiation by id with its load, which is null when the viewer may no
 * longer see it (contracted with another carrier, loads_select): the
 * negotiation and its offers stay visible, so the history and the chat do.
 */
export async function getCarrierNegotiation(
  supabase: Supabase,
  companyId: string,
  negotiationId: string,
): Promise<(CarrierNegotiation & { load: CarrierLoad | null }) | null> {
  if (!uuidField.safeParse(negotiationId).success) return null;
  const { data, error } = await supabase
    .from('negotiations')
    .select(NEGOTIATION_COLUMNS)
    .eq('id', negotiationId)
    .eq('carrier_company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(`Negotiation query failed: ${error.message}`);
  if (!data) return null;
  const [details, load] = await Promise.all([
    negotiationDetails(supabase, data),
    getCarrierLoad(supabase, data.load_id),
  ]);
  return { ...details, load };
}

export interface NegotiationRow {
  id: string;
  businessUnitId: string;
  updatedAt: string;
  /** Null when the load was contracted with another carrier. */
  load: CarrierLoad | null;
  offers: NegotiationOffer[];
  state: CarrierNegotiationState;
}

/** The company's negotiations of the given business units, most recent first. */
export async function listCarrierNegotiations(
  supabase: Supabase,
  companyId: string,
  { businessUnitIds, page }: { businessUnitIds: readonly string[]; page: number },
): Promise<{ rows: NegotiationRow[]; total: number }> {
  if (businessUnitIds.length === 0) return { rows: [], total: 0 };
  const from = (page - 1) * CARRIER_PAGE_SIZE;
  const { data, count, error } = await supabase
    .from('negotiations')
    .select(NEGOTIATION_COLUMNS, { count: 'exact' })
    .eq('carrier_company_id', companyId)
    .in('business_unit_id', [...businessUnitIds])
    .order('updated_at', { ascending: false })
    .order('id')
    .range(from, from + CARRIER_PAGE_SIZE - 1);
  if (error) throw new Error(`Negotiations query failed: ${error.message}`);
  if (data.length === 0) return { rows: [], total: count ?? 0 };
  const [loads, offers] = await Promise.all([
    supabase
      .from('loads')
      .select(LOAD_COLUMNS)
      .in(
        'id',
        data.map((n) => n.load_id),
      ),
    supabase
      .from('offers')
      .select(OFFER_COLUMNS)
      .in(
        'negotiation_id',
        data.map((n) => n.id),
      ),
  ]);
  const loadById = new Map(check(loads).map((l) => [l.id, l]));
  const allOffers = check(offers);
  return {
    rows: data.map((n) => {
      const load = loadById.get(n.load_id) ?? null;
      const own = allOffers.filter((o) => o.negotiation_id === n.id);
      return {
        id: n.id,
        businessUnitId: n.business_unit_id,
        updatedAt: n.updated_at,
        load,
        offers: own,
        // Hidden load: contracted with another carrier (loads_select).
        state: carrierNegotiationState(own, load?.status ?? 'contracted'),
      };
    }),
    total: count ?? data.length,
  };
}
