import 'server-only';

import {
  uploadableTripDocumentKinds,
  uuidField,
  type UnitType,
  type VerificationStatus,
} from '@transport/shared';

import type { Supabase } from '../viewer';
import { FINISHED_TRIP_STATUSES, type TripsView } from './tracking';

/** Rows per page of the trips list. */
export const TRIPS_PAGE_SIZE = 25;

/** Latest GPS points drawn on the map (about 16 h at one point per minute). */
export const MAP_POINTS_LIMIT = 1000;

const LOAD_SUMMARY =
  'origin_city, origin_state, destination_city, destination_state, pickup_window_start';

export interface TripParties {
  carrierName: string;
  carrierStatus: VerificationStatus;
  unitType: UnitType | null;
  plate: string | null;
  operatorName: string | null;
}

/**
 * Carrier, unit and operator of the shipper's trips (shipper_trip_parties:
 * the shipper cannot read the carrier's fleet tables directly).
 */
async function tripParties(supabase: Supabase, tripIds: string[]) {
  const parties = new Map<string, TripParties>();
  if (tripIds.length === 0) return parties;
  const { data, error } = await supabase.rpc('shipper_trip_parties', { p_trip_ids: tripIds });
  if (error) throw new Error(`Trip parties query failed: ${error.message}`);
  for (const row of data) {
    parties.set(row.trip_id, {
      carrierName: row.carrier_legal_name,
      carrierStatus: row.carrier_status,
      unitType: row.unit_type ?? null,
      plate: row.plate ?? null,
      operatorName: row.operator_name ?? null,
    });
  }
  return parties;
}

/**
 * The company's active trips or its history (closed and cancelled), newest
 * first. RLS already limits a shipper to its own trips; filtering by company
 * keeps the query explicit and indexed.
 */
export async function listCompanyTrips(
  supabase: Supabase,
  companyId: string,
  { view, page }: { view: TripsView; page: number },
) {
  const from = (page - 1) * TRIPS_PAGE_SIZE;
  const finished = `(${FINISHED_TRIP_STATUSES.join(',')})`;
  let query = supabase
    .from('trips')
    .select(`id, status, created_at, load:loads!trips_load_id_fkey(${LOAD_SUMMARY})`, {
      count: 'exact',
    })
    .eq('shipper_company_id', companyId);
  query =
    view === 'history'
      ? query.in('status', FINISHED_TRIP_STATUSES)
      : query.not('status', 'in', finished);
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, from + TRIPS_PAGE_SIZE - 1);
  if (error) throw new Error(`Trips query failed: ${error.message}`);
  const parties = await tripParties(
    supabase,
    data.map((trip) => trip.id),
  );
  return {
    rows: data.map((trip) => ({ ...trip, parties: parties.get(trip.id) ?? null })),
    total: count ?? data.length,
  };
}

/**
 * Everything the trip screen shows, or null when the trip does not exist or
 * is not the company's. Locations come back only while the trip is active
 * (RLS).
 */
export async function getCompanyTrip(supabase: Supabase, companyId: string, tripId: string) {
  if (!uuidField.safeParse(tripId).success) return null;
  const { data: trip, error } = await supabase
    .from('trips')
    .select(
      `id, load_id, carrier_company_id, status, estimated_unload_end_at, started_at, delivered_at,
       closed_at, cancelled_at, cancellation_reason, created_at,
       load:loads!trips_load_id_fkey(${LOAD_SUMMARY}, origin_lat, origin_lng,
         destination_lat, destination_lng, agreed_price_cents)`,
    )
    .eq('id', tripId)
    .eq('shipper_company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(`Trip query failed: ${error.message}`);
  if (!trip) return null;

  const [
    events,
    incidents,
    evidence,
    documents,
    locations,
    conversation,
    parties,
    checklist,
    requirements,
  ] = await Promise.all([
    supabase
      .from('trip_events')
      .select(
        'id, event_type, occurred_at, estimated_unload_end_at, incident_id, notes, received_by_name',
      )
      .eq('trip_id', trip.id)
      .order('occurred_at')
      .order('recorded_at'),
    supabase
      .from('incidents')
      .select('id, kind, description, status, occurred_at, resolution')
      .eq('trip_id', trip.id)
      .order('occurred_at'),
    supabase
      .from('trip_evidence')
      .select('id, stage, storage_path, captured_at')
      .eq('trip_id', trip.id)
      .order('captured_at'),
    supabase
      .from('trip_documents')
      .select('id, kind, storage_path, file_name, created_at')
      .eq('trip_id', trip.id)
      .order('created_at'),
    supabase
      .from('trip_locations')
      .select('recorded_at, latitude, longitude')
      .eq('trip_id', trip.id)
      .order('recorded_at', { ascending: false })
      .limit(MAP_POINTS_LIMIT),
    supabase.from('conversations').select('id').eq('trip_id', trip.id).maybeSingle(),
    tripParties(supabase, [trip.id]),
    supabase.rpc('trip_checklist', { p_trip_id: trip.id }),
    supabase.from('trip_document_requirements').select('kind, uploader_sides, sort_order'),
  ]);
  for (const [name, result] of Object.entries({
    events,
    incidents,
    evidence,
    documents,
    locations,
    conversation,
    checklist,
    requirements,
  })) {
    if (result.error) throw new Error(`Trip ${name} query failed: ${result.error.message}`);
  }

  return {
    trip,
    parties: parties.get(trip.id) ?? null,
    events: events.data ?? [],
    incidents: incidents.data ?? [],
    evidence: evidence.data ?? [],
    documents: documents.data ?? [],
    /** What the trip still needs (trip_checklist, D22). */
    checklist: checklist.data ?? [],
    /** Kinds the shipper may upload (trip_document_requirements), in order. */
    uploadableKinds: uploadableTripDocumentKinds(requirements.data ?? [], 'shipper'),
    // Oldest first, to draw the trail in order.
    locations: (locations.data ?? []).reverse(),
    conversationId: conversation.data?.id ?? null,
  };
}

/** The trip of a contracted load of the company, if any (link from the load screen). */
export async function findLoadTripId(supabase: Supabase, companyId: string, loadId: string) {
  const { data, error } = await supabase
    .from('trips')
    .select('id')
    .eq('load_id', loadId)
    .eq('shipper_company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(`Load trip query failed: ${error.message}`);
  return data?.id ?? null;
}
