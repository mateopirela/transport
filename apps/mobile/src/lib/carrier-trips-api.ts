import {
  isTripActive,
  type AssignableOperator,
  type AssignableUnit,
  type Tables,
  type TripStatus,
} from '@transport/shared';

import { listOperators, listVehicles, loadCompanyContext } from './fleet-api';
import { unitLabel } from './loads-api';
import type { Supabase } from './supabase';

// Data access of the carrier's trips screens (B20). Everything goes through
// the user's JWT: RLS shows a carrier only the trips of its company (and their
// loads, timeline, evidence and GPS points), and the assignment changes only
// through assign_trip (B06), which validates the unit, the operator and the
// status. The assignment notifies the operator (notify_trip_event, B07).

function check<T>({ data, error }: { data: T; error: unknown }): NonNullable<T> {
  if (error) throw error;
  if (data === null || data === undefined) throw new Error('empty response');
  return data;
}

const TRIP_COLUMNS =
  'id, status, load_id, offer_id, vehicle_id, operator_id, estimated_unload_end_at, cancellation_reason, created_at, updated_at';

type TripRow = Pick<
  Tables<'trips'>,
  | 'id'
  | 'status'
  | 'load_id'
  | 'offer_id'
  | 'vehicle_id'
  | 'operator_id'
  | 'estimated_unload_end_at'
  | 'cancellation_reason'
  | 'created_at'
  | 'updated_at'
>;

const LOAD_COLUMNS =
  'id, origin_city, origin_state, origin_address, origin_lat, origin_lng, destination_city, destination_state, destination_address, destination_lat, destination_lng, pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end, cargo_type, description, weight_kg, unit_type, agreed_price_cents';

export type CarrierTripLoad = Pick<
  Tables<'loads'>,
  | 'id'
  | 'origin_city'
  | 'origin_state'
  | 'origin_address'
  | 'origin_lat'
  | 'origin_lng'
  | 'destination_city'
  | 'destination_state'
  | 'destination_address'
  | 'destination_lat'
  | 'destination_lng'
  | 'pickup_window_start'
  | 'pickup_window_end'
  | 'delivery_window_start'
  | 'delivery_window_end'
  | 'cargo_type'
  | 'description'
  | 'weight_kg'
  | 'unit_type'
  | 'agreed_price_cents'
>;

export interface LastPosition {
  lat: number;
  lng: number;
  recordedAt: string;
}

export interface CarrierTripSummary {
  id: string;
  status: TripStatus;
  load: CarrierTripLoad;
  vehicleId: string | null;
  operatorId: string | null;
  /** How the unit and the operator are named, when assigned. */
  unitName: string | null;
  operatorName: string | null;
  estimatedUnloadEndAt: string | null;
  /** Latest GPS point, only for trips on the road. */
  lastPosition: LastPosition | null;
  pickupAt: string;
  updatedAt: string;
}

/** Statuses in which a trip keeps a unit and an operator busy. */
const BUSY_STATUSES: readonly TripStatus[] = [
  'assigned',
  'en_route_to_pickup',
  'at_pickup',
  'loading',
  'in_transit',
  'at_delivery',
  'unloading',
];

async function lastPosition(client: Supabase, tripId: string): Promise<LastPosition | null> {
  const point = check(
    await client
      .from('trip_locations')
      .select('latitude, longitude, recorded_at')
      .eq('trip_id', tripId)
      .order('recorded_at', { ascending: false })
      .limit(1),
  )[0];
  return point
    ? { lat: point.latitude, lng: point.longitude, recordedAt: point.recorded_at }
    : null;
}

async function namesOf(client: Supabase, companyId: string) {
  const [vehicles, operators] = await Promise.all([
    client.from('vehicles').select('id, plate, fleet_number').eq('company_id', companyId),
    client.from('operators').select('id, full_name').eq('company_id', companyId),
  ]);
  return {
    unit: new Map(check(vehicles).map((v) => [v.id, unitLabel(v)])),
    operator: new Map(check(operators).map((o) => [o.id, o.full_name])),
  };
}

function summarize(
  trip: TripRow,
  load: CarrierTripLoad,
  names: Awaited<ReturnType<typeof namesOf>>,
  position: LastPosition | null,
): CarrierTripSummary {
  return {
    id: trip.id,
    status: trip.status,
    load,
    vehicleId: trip.vehicle_id,
    operatorId: trip.operator_id,
    unitName: trip.vehicle_id ? (names.unit.get(trip.vehicle_id) ?? null) : null,
    operatorName: trip.operator_id ? (names.operator.get(trip.operator_id) ?? null) : null,
    estimatedUnloadEndAt: trip.estimated_unload_end_at,
    lastPosition: position,
    pickupAt: load.pickup_window_start,
    updatedAt: trip.updated_at,
  };
}

/** The carrier's trips (latest 100) with their load, assignment and last position. */
export async function listCarrierTrips(
  client: Supabase,
  companyId: string,
): Promise<CarrierTripSummary[]> {
  const trips = check(
    await client
      .from('trips')
      .select(TRIP_COLUMNS)
      .eq('carrier_company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(100),
  );
  if (trips.length === 0) return [];
  const [loads, names, positions] = await Promise.all([
    client
      .from('loads')
      .select(LOAD_COLUMNS)
      .in(
        'id',
        trips.map((t) => t.load_id),
      ),
    namesOf(client, companyId),
    Promise.all(
      trips.map(
        async (t) =>
          [t.id, isTripActive(t.status) ? await lastPosition(client, t.id) : null] as const,
      ),
    ),
  ]);
  const loadById = new Map(check(loads).map((l) => [l.id, l]));
  const positionByTrip = new Map(positions);
  return trips.flatMap((trip) => {
    const load = loadById.get(trip.load_id);
    return load ? [summarize(trip, load, names, positionByTrip.get(trip.id) ?? null)] : [];
  });
}

export type CarrierTripEvent = Pick<
  Tables<'trip_events'>,
  'id' | 'event_type' | 'occurred_at' | 'estimated_unload_end_at' | 'received_by_name'
>;

export type CarrierTripIncident = Pick<
  Tables<'incidents'>,
  'id' | 'kind' | 'description' | 'status' | 'occurred_at'
>;

export interface AssignmentOptions {
  units: (AssignableUnit & { name: string })[];
  operators: (AssignableOperator & { name: string })[];
  /** Unit of the winning offer, the default choice. */
  offeredUnitId: string | null;
}

export interface CarrierTripDetail {
  trip: CarrierTripSummary;
  cancellationReason: string | null;
  events: CarrierTripEvent[];
  incidents: CarrierTripIncident[];
  evidence: { pickup: number; delivery: number };
  /** GPS points of the trip, oldest first (latest 300). */
  trail: { lat: number; lng: number }[];
  conversationId: string | null;
  assignment: AssignmentOptions;
}

/** Units and operators the carrier can assign, with what else they are busy with. */
async function assignmentOptions(
  client: Supabase,
  companyId: string,
  trip: TripRow,
): Promise<AssignmentOptions> {
  const context = await loadCompanyContext(client, companyId);
  const [vehicles, operators, busy, offer, usual] = await Promise.all([
    listVehicles(client, context),
    listOperators(client, companyId),
    client
      .from('trips')
      .select('id, vehicle_id, operator_id')
      .eq('carrier_company_id', companyId)
      .in('status', [...BUSY_STATUSES])
      .neq('id', trip.id),
    client.from('offers').select('vehicle_id').eq('id', trip.offer_id).maybeSingle(),
    client
      .from('vehicles')
      .select('id, current_operator_id')
      .eq('company_id', companyId)
      .is('archived_at', null),
  ]);
  if (offer.error) throw offer.error;
  const others = check(busy);
  const usualOperator = new Map(check(usual).map((v) => [v.id, v.current_operator_id]));
  return {
    units: vehicles
      .filter((v) => v.unit_type !== null)
      .map((v) => ({
        id: v.id,
        name: unitLabel(v),
        unitType: v.unit_type,
        expiredDocuments: v.readiness === 'expired_documents',
        currentOperatorId: usualOperator.get(v.id) ?? null,
        otherTrips: others.filter((t) => t.vehicle_id === v.id).length,
      })),
    operators: operators.map((o) => ({
      id: o.id,
      name: o.full_name,
      hasAccount: o.profile_id !== null,
      otherTrips: others.filter((t) => t.operator_id === o.id).length,
    })),
    offeredUnitId: offer.data?.vehicle_id ?? null,
  };
}

/** One trip of the carrier with everything its detail screen shows, or null. */
export async function loadCarrierTrip(
  client: Supabase,
  companyId: string,
  tripId: string,
): Promise<CarrierTripDetail | null> {
  const found = await client
    .from('trips')
    .select(TRIP_COLUMNS)
    .eq('id', tripId)
    .eq('carrier_company_id', companyId)
    .maybeSingle();
  if (found.error) throw found.error;
  const trip = found.data;
  if (!trip) return null;

  const [load, names, events, incidents, evidence, trail, conversation, assignment] =
    await Promise.all([
      client.from('loads').select(LOAD_COLUMNS).eq('id', trip.load_id).single(),
      namesOf(client, companyId),
      client
        .from('trip_events')
        .select('id, event_type, occurred_at, estimated_unload_end_at, received_by_name')
        .eq('trip_id', trip.id)
        .order('occurred_at')
        .order('recorded_at'),
      client
        .from('incidents')
        .select('id, kind, description, status, occurred_at')
        .eq('trip_id', trip.id)
        .order('occurred_at', { ascending: false }),
      client.from('trip_evidence').select('stage').eq('trip_id', trip.id),
      client
        .from('trip_locations')
        .select('latitude, longitude, recorded_at')
        .eq('trip_id', trip.id)
        .order('recorded_at', { ascending: false })
        .limit(300),
      client.from('conversations').select('id').eq('trip_id', trip.id).maybeSingle(),
      assignmentOptions(client, companyId, trip),
    ]);
  if (conversation.error) throw conversation.error;
  const points = check(trail);
  const latest = points[0];
  const photos = check(evidence);
  return {
    trip: summarize(
      trip,
      check(load),
      names,
      latest
        ? { lat: latest.latitude, lng: latest.longitude, recordedAt: latest.recorded_at }
        : null,
    ),
    cancellationReason: trip.cancellation_reason,
    events: check(events),
    incidents: check(incidents),
    evidence: {
      pickup: photos.filter((p) => p.stage === 'pickup').length,
      delivery: photos.filter((p) => p.stage === 'delivery').length,
    },
    trail: points.map((p) => ({ lat: p.latitude, lng: p.longitude })).reverse(),
    conversationId: conversation.data?.id ?? null,
    assignment,
  };
}

/** Assigns (or reassigns) the unit and the operator; the operator gets a push. */
export async function assignTrip(
  client: Supabase,
  tripId: string,
  vehicleId: string,
  operatorId: string,
): Promise<void> {
  const { error } = await client.rpc('assign_trip', {
    p_trip_id: tripId,
    p_vehicle_id: vehicleId,
    p_operator_id: operatorId,
  });
  if (error) throw error;
}
