import {
  evidenceMinimumsFrom,
  type DwellEstimate,
  pickOperatorTrip,
  type EvidenceMinimums,
  type Tables,
  type TripDocumentKind,
  type TripStatus,
} from '@transport/shared';

import { siteDwellEstimate } from './dwell-api';
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
  | 'id'
  | 'event_type'
  | 'occurred_at'
  | 'estimated_unload_end_at'
  | 'notes'
  | 'client_event_id'
  | 'received_by_name'
> & {
  /** The incident of an `incident_reported` event (F7). Absent in copies saved before it. */
  incident_id?: string | null;
};

export type EvidenceRow = Pick<
  Tables<'trip_evidence'>,
  'id' | 'stage' | 'incident_id' | 'storage_path' | 'captured_at'
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
  /** Photos the server has (B23); counted against `evidenceMinimums`. */
  evidence: EvidenceRow[];
  evidenceMinimums: EvidenceMinimums;
  /**
   * Documents the operator reads on the road (D22: the service order and the
   * Carta Porte). Absent in copies saved on the phone before G3.
   */
  documents?: OperatorTripDocument[];
  /**
   * H5: the typical unloading at the delivery site, which suggests the end
   * of unloading. Null when unknown; absent in copies saved before H5.
   */
  unloadDwell?: DwellEstimate | null;
}

export type OperatorTripDocument = Pick<
  Tables<'trip_documents'>,
  'id' | 'kind' | 'storage_path' | 'file_name' | 'created_at'
>;

/** Kinds the operator needs on the road; the rest stays with the coordinator. */
export const OPERATOR_DOCUMENT_KINDS: TripDocumentKind[] = ['service_order', 'carta_porte'];

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
  // Only the trips assigned to the caller's own operator row: a hombre-camión
  // (D13, "Mi viaje") is also a Gerente and can read every trip of the company.
  const own = await client.rpc('auth_operator_id');
  if (own.error) throw own.error;
  const operatorId = own.data;
  if (!operatorId) return null;
  const trips = check(
    await client
      .from('trips')
      .select('id, status, load_id, vehicle_id, estimated_unload_end_at, shipper_company_id')
      .eq('operator_id', operatorId)
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

  const [events, incidents, vehicle, evidence, minimums, documents, unloadDwell] =
    await Promise.all([
      client
        .from('trip_events')
        .select(
          'id, event_type, occurred_at, estimated_unload_end_at, notes, client_event_id, received_by_name, incident_id',
        )
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
      client
        .from('trip_evidence')
        .select('id, stage, incident_id, storage_path, captured_at')
        .eq('trip_id', trip.id)
        .order('captured_at'),
      client.from('trip_evidence_requirements').select('stage, min_photos'),
      client
        .from('trip_documents')
        .select('id, kind, storage_path, file_name, created_at')
        .eq('trip_id', trip.id)
        .in('kind', OPERATOR_DOCUMENT_KINDS)
        .order('created_at'),
      siteDwellEstimate(
        client,
        'delivery',
        { lat: trip.load.destination_lat, lng: trip.load.destination_lng },
        { shipperCompanyId: trip.shipper_company_id },
      ),
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
    evidence: check(evidence),
    evidenceMinimums: evidenceMinimumsFrom(check(minimums)),
    documents: check(documents),
    unloadDwell,
  };
}

/** Short-lived link to open a trip document (the bucket policy checks the reader). */
export async function operatorTripDocumentUrl(
  client: Supabase,
  storagePath: string,
): Promise<string> {
  const { data, error } = await client.storage
    .from('trip-documents')
    .createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

/** Sends one queued action to its RPC. Throws the PostgREST error as is. */
export async function sendQueuedAction(client: Supabase, action: QueuedAction): Promise<void> {
  const { error } = await rpcFor(client, action);
  if (error) throw error;
}

function rpcFor(client: Supabase, action: QueuedAction) {
  switch (action.kind) {
    case 'status':
      return client.rpc('record_trip_event', {
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
        ...(action.receivedBy ? { p_received_by_name: action.receivedBy } : {}),
      });
    case 'estimate':
      return client.rpc('set_estimated_unload_end', {
        p_trip_id: action.tripId,
        p_estimated_unload_end_at: action.estimatedUnloadEndAt,
        p_occurred_at: action.occurredAt,
        p_client_event_id: action.id,
      });
    case 'incident':
      // The key makes a retry after a lost response return the incident
      // already recorded instead of a second one (F2), and lets its photos
      // name it before the phone knows its id (F7).
      return client.rpc('report_incident', {
        p_trip_id: action.tripId,
        p_kind: action.incidentKind,
        p_description: action.description,
        p_occurred_at: action.occurredAt,
        ...(action.lat === null || action.lng === null
          ? {}
          : { p_latitude: action.lat, p_longitude: action.lng }),
        p_client_event_id: action.id,
      });
  }
}
