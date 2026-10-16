import {
  pickOperatorTrip,
  type IncidentFormValues,
  type Tables,
  type TripStatus,
} from '@transport/shared';

import type { Supabase } from './supabase';
import type { QueuedAction } from './trip-queue';

// Data access of the operator's trip screen (B21). RLS limits every query to
// the trips assigned to the signed-in operator, and every write goes through
// the trip RPCs (B06), which validate the actor and the transition.

function check<T>({ data, error }: { data: T; error: unknown }): NonNullable<T> {
  if (error) throw error;
  if (data === null || data === undefined) throw new Error('empty response');
  return data;
}

export type TripLoad = Pick<
  Tables<'loads'>,
  | 'origin_address'
  | 'origin_city'
  | 'origin_state'
  | 'origin_lat'
  | 'origin_lng'
  | 'destination_address'
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
  | 'special_requirements'
  | 'notes'
>;

export type TripEventRow = Pick<
  Tables<'trip_events'>,
  'id' | 'event_type' | 'occurred_at' | 'estimated_unload_end_at' | 'notes' | 'client_event_id'
>;

export type IncidentRow = Pick<
  Tables<'incidents'>,
  'id' | 'kind' | 'description' | 'status' | 'occurred_at'
>;

export interface OperatorTrip {
  id: string;
  status: TripStatus;
  estimatedUnloadEndAt: string | null;
  load: TripLoad;
  vehiclePlate: string | null;
  events: TripEventRow[];
  incidents: IncidentRow[];
}

const LOAD_COLUMNS =
  'id, origin_address, origin_city, origin_state, origin_lat, origin_lng, destination_address, destination_city, destination_state, destination_lat, destination_lng, pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end, cargo_type, description, weight_kg, special_requirements, notes';

/** Trips the operator still works on (see trip_in_operator_hands in SQL). */
const OPERATOR_STATUSES: TripStatus[] = [
  'assigned',
  'en_route_to_pickup',
  'at_pickup',
  'loading',
  'in_transit',
  'at_delivery',
  'unloading',
  'delivered',
];

/** The trip the operator works on now (see pickOperatorTrip), or null. */
export async function loadOperatorTrip(client: Supabase): Promise<OperatorTrip | null> {
  const trips = check(
    await client
      .from('trips')
      .select('id, status, load_id, vehicle_id, estimated_unload_end_at')
      .in('status', OPERATOR_STATUSES),
  );
  if (trips.length === 0) return null;

  const loads = check(
    await client
      .from('loads')
      .select(LOAD_COLUMNS)
      .in(
        'id',
        trips.map((t) => t.load_id),
      ),
  );
  const loadById = new Map(loads.map((l) => [l.id, l]));
  const candidates = trips.flatMap((trip) => {
    const load = loadById.get(trip.load_id);
    return load ? [{ ...trip, load, pickupAt: load.pickup_window_start }] : [];
  });
  const trip = pickOperatorTrip(candidates);
  if (!trip) return null;

  const [events, incidents, vehicle] = await Promise.all([
    client
      .from('trip_events')
      .select('id, event_type, occurred_at, estimated_unload_end_at, notes, client_event_id')
      .eq('trip_id', trip.id)
      .order('occurred_at')
      .order('recorded_at'),
    client
      .from('incidents')
      .select('id, kind, description, status, occurred_at')
      .eq('trip_id', trip.id)
      .order('occurred_at', { ascending: false }),
    trip.vehicle_id
      ? client.from('vehicles').select('plate').eq('id', trip.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (vehicle.error) throw vehicle.error;

  return {
    id: trip.id,
    status: trip.status,
    estimatedUnloadEndAt: trip.estimated_unload_end_at,
    load: trip.load,
    vehiclePlate: vehicle.data?.plate ?? null,
    events: check(events),
    incidents: check(incidents),
  };
}

/** Sends one queued action to its RPC. Throws the PostgREST error as is. */
export async function sendQueuedAction(client: Supabase, action: QueuedAction): Promise<void> {
  const { error } =
    action.kind === 'status'
      ? await client.rpc('record_trip_event', {
          p_trip_id: action.tripId,
          p_event_type: action.event,
          p_occurred_at: action.occurredAt,
          p_latitude: action.lat,
          p_longitude: action.lng,
          ...(action.accuracyM === null ? {} : { p_accuracy_m: action.accuracyM }),
          ...(action.estimatedUnloadEndAt === null
            ? {}
            : { p_estimated_unload_end_at: action.estimatedUnloadEndAt }),
          p_client_event_id: action.id,
        })
      : await client.rpc('set_estimated_unload_end', {
          p_trip_id: action.tripId,
          p_estimated_unload_end_at: action.estimatedUnloadEndAt,
          p_occurred_at: action.occurredAt,
          p_client_event_id: action.id,
        });
  if (error) throw error;
}

/** Reports an incident (online only: report_incident has no idempotency key). */
export async function reportIncident(
  client: Supabase,
  tripId: string,
  values: IncidentFormValues,
  position: { lat: number; lng: number } | null,
): Promise<void> {
  const { error } = await client.rpc('report_incident', {
    p_trip_id: tripId,
    p_kind: values.kind,
    p_description: values.description,
    ...(position ? { p_latitude: position.lat, p_longitude: position.lng } : {}),
  });
  if (error) throw error;
}
