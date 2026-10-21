import 'server-only';

import {
  hidesInternalChat,
  licensePairsFrom,
  operatorLicenseCurrent,
  unitLabel,
  uploadableTripDocumentKinds,
  uuidField,
  type AssignableOperator,
  type AssignableUnit,
  type LicensePairs,
  type Tables,
  type TripStatus,
} from '@transport/shared';

import { MAP_POINTS_LIMIT } from '../trips/queries';
import type { Supabase } from '../viewer';
import { selectAll } from '../verification/paging';
import { listCarrierOperators, listCarrierVehicles, loadFleetContext } from './fleet';
import { getCarrierLoad } from './loads';
import { tripsViewStatuses, type CarrierTripsView } from './trip-filters';

// Reads of the carrier's trips screens (G10b; B20 on the app). Everything
// goes through the user's JWT: RLS shows the staff only the trips of their
// business units (G1a) with their timeline, evidence, documents and GPS
// points, and every change happens through a validated RPC (assign_trip,
// cancel_trip, report_incident, add_trip_document) in trip-actions.ts.

function check<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error) throw new Error(error.message);
  if (data === null || data === undefined) throw new Error('empty response');
  return data;
}

/** Rows per page of the trips list. */
export const CARRIER_TRIPS_PAGE_SIZE = 25;

const LOAD_SUMMARY =
  'origin_city, origin_state, destination_city, destination_state, pickup_window_start';

const TRIP_ROW_COLUMNS = `id, status, business_unit_id, created_at, updated_at,
  load:loads!trips_load_id_fkey(${LOAD_SUMMARY}),
  vehicle:vehicles!trips_vehicle_fkey(plate, fleet_number),
  operator:operators!trips_operator_fkey(full_name),
  business_unit:business_units!trips_business_unit_fkey(name)`;

export interface CarrierTripRow {
  id: string;
  status: TripStatus;
  businessUnitId: string;
  businessUnitName: string | null;
  load: Pick<
    Tables<'loads'>,
    | 'origin_city'
    | 'origin_state'
    | 'destination_city'
    | 'destination_state'
    | 'pickup_window_start'
  > | null;
  /** How the unit and the operator are named, when assigned. */
  unitName: string | null;
  operatorName: string | null;
}

/**
 * Trips of the company in the given business units and tab, newest first.
 * RLS already limits a Coordinador to their units; the filter applies the
 * picker's selection (or the `unidad` parameter).
 */
export async function listCarrierTrips(
  supabase: Supabase,
  companyId: string,
  {
    businessUnitIds,
    view,
    page,
  }: { businessUnitIds: readonly string[]; view: CarrierTripsView; page: number },
): Promise<{ rows: CarrierTripRow[]; total: number }> {
  if (businessUnitIds.length === 0) return { rows: [], total: 0 };
  const from = (page - 1) * CARRIER_TRIPS_PAGE_SIZE;
  const { data, count, error } = await supabase
    .from('trips')
    .select(TRIP_ROW_COLUMNS, { count: 'exact' })
    .eq('carrier_company_id', companyId)
    .in('business_unit_id', [...businessUnitIds])
    .in('status', tripsViewStatuses(view))
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, from + CARRIER_TRIPS_PAGE_SIZE - 1);
  if (error) throw new Error(`Trips query failed: ${error.message}`);
  return {
    rows: data.map((trip) => ({
      id: trip.id,
      status: trip.status,
      businessUnitId: trip.business_unit_id,
      businessUnitName: trip.business_unit?.name ?? null,
      load: trip.load,
      unitName: trip.vehicle ? unitLabel(trip.vehicle) : null,
      operatorName: trip.operator?.full_name ?? null,
    })),
    total: count ?? data.length,
  };
}

/**
 * Unread messages of the internal chat of the trips on screen (H1), from
 * internal_chat_inbox narrowed to them (RLS): only trips with unread ones.
 */
export async function internalUnreadByTrip(
  supabase: Supabase,
  tripIds: readonly string[],
): Promise<Map<string, number>> {
  if (tripIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc('internal_chat_inbox', { p_trip_ids: [...tripIds] });
  if (error) throw new Error(`Internal chat inbox query failed: ${error.message}`);
  return new Map(
    data.filter((row) => row.unread_count > 0).map((row) => [row.trip_id, row.unread_count]),
  );
}

/** The trip of a load the company won, if visible (link from the load and the negotiation). */
export async function findCarrierTripId(
  supabase: Supabase,
  companyId: string,
  loadId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('trips')
    .select('id')
    .eq('load_id', loadId)
    .eq('carrier_company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(`Load trip query failed: ${error.message}`);
  return data?.id ?? null;
}

/** Statuses in which a trip keeps a unit and an operator busy (warnings of the assignment). */
const BUSY_STATUSES: readonly TripStatus[] = [
  'assigned',
  'en_route_to_pickup',
  'at_pickup',
  'loading',
  'in_transit',
  'at_delivery',
  'unloading',
];

export interface AssignmentOptions {
  units: (AssignableUnit & { name: string; businessUnitName: string | null })[];
  operators: (AssignableOperator & { name: string; businessUnitName: string | null })[];
  /** Unit of the winning offer, the default choice. */
  offeredUnitId: string | null;
  /** Current license <-> unit kind pairs (license_unit_compatibility), as assign_trip checks them. */
  licensePairs: LicensePairs;
}

/**
 * Units and operators the viewer can assign, with what else they are busy
 * with. A Coordinador only those of the trip's business unit; the Gerente
 * any of the company (assign_trip then moves the trip to the unit's business
 * unit, G1a).
 */
async function assignmentOptions(
  supabase: Supabase,
  companyId: string,
  trip: { id: string; offer_id: string; business_unit_id: string },
  businessUnitIds: readonly string[],
): Promise<AssignmentOptions> {
  const context = await loadFleetContext(supabase, companyId);
  const [vehicles, operators, busy, offer, pairs] = await Promise.all([
    listCarrierVehicles(supabase, context, businessUnitIds),
    listCarrierOperators(supabase, companyId, businessUnitIds),
    selectAll<{ id: string; vehicle_id: string | null; operator_id: string | null }>((from, to) =>
      supabase
        .from('trips')
        .select('id, vehicle_id, operator_id')
        .eq('carrier_company_id', companyId)
        .in('status', [...BUSY_STATUSES])
        .neq('id', trip.id)
        .order('id')
        .range(from, to),
    ),
    supabase.from('offers').select('vehicle_id').eq('id', trip.offer_id).maybeSingle(),
    supabase.from('license_unit_compatibility').select('license_type, vehicle_kind, allowed'),
  ]);
  if (offer.error) throw new Error(`Offer query failed: ${offer.error.message}`);
  const others = busy;
  const now = new Date();
  return {
    units: vehicles
      .filter((v) => v.unit_type !== null)
      .map((v) => ({
        id: v.id,
        name: unitLabel(v),
        businessUnitName: v.businessUnitName,
        kind: v.kind,
        unitType: v.unit_type,
        expiredDocuments: v.readiness === 'expired_documents',
        currentOperatorId: v.current_operator_id,
        otherTrips: others.filter((t) => t.vehicle_id === v.id).length,
      })),
    operators: operators.map((o) => ({
      id: o.id,
      name: o.full_name,
      businessUnitName: o.businessUnitName,
      hasAccount: o.profile_id !== null,
      licenseType: o.license_type,
      licenseCurrent: operatorLicenseCurrent(o, context.requirements, context.documents, now),
      otherTrips: others.filter((t) => t.operator_id === o.id).length,
    })),
    offeredUnitId: offer.data?.vehicle_id ?? null,
    licensePairs: licensePairsFrom(check(pairs)),
  };
}

/**
 * Everything the carrier's trip screen shows, or null when the trip does not
 * exist or is not in the viewer's business units (RLS). The load is read as
 * the carrier sees it (loads_select); locations come back only while the
 * trip is active.
 */
export async function getCarrierTrip(
  supabase: Supabase,
  {
    companyId,
    isManager,
    operableIds,
  }: { companyId: string; isManager: boolean; operableIds: readonly string[] },
  tripId: string,
) {
  if (!uuidField.safeParse(tripId).success) return null;
  const { data: trip, error } = await supabase
    .from('trips')
    .select(
      `id, load_id, offer_id, shipper_company_id, status, business_unit_id, vehicle_id, operator_id,
       estimated_unload_end_at, started_at, cancellation_reason, cancellation_reason_code, created_at,
       vehicle:vehicles!trips_vehicle_fkey(plate, fleet_number),
       operator:operators!trips_operator_fkey(full_name),
       business_unit:business_units!trips_business_unit_fkey(name)`,
    )
    .eq('id', tripId)
    .eq('carrier_company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(`Trip query failed: ${error.message}`);
  if (!trip) return null;

  const [
    load,
    agreed,
    events,
    incidents,
    evidence,
    documents,
    locations,
    conversation,
    internalConversation,
    staff,
    company,
    checklist,
    requirements,
    assignment,
  ] = await Promise.all([
    getCarrierLoad(supabase, trip.load_id),
    supabase.from('loads').select('agreed_price_cents').eq('id', trip.load_id).maybeSingle(),
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
    supabase
      .from('conversations')
      .select('id')
      .eq('trip_id', trip.id)
      .eq('kind', 'trip')
      .maybeSingle(),
    supabase
      .from('conversations')
      .select('id')
      .eq('trip_id', trip.id)
      .eq('kind', 'trip_internal')
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId),
    supabase.from('companies').select('is_owner_operator').eq('id', companyId).maybeSingle(),
    supabase.rpc('trip_checklist', { p_trip_id: trip.id }),
    supabase.from('trip_document_requirements').select('kind, uploader_sides, sort_order'),
    assignmentOptions(
      supabase,
      companyId,
      trip,
      // The Gerente may pick from every business unit of the company (assign_trip).
      isManager ? operableIds : [trip.business_unit_id],
    ),
  ]);
  for (const [name, result] of Object.entries({
    agreed,
    events,
    incidents,
    evidence,
    documents,
    locations,
    conversation,
    internalConversation,
    staff,
    company,
    checklist,
    requirements,
  })) {
    if (result.error) throw new Error(`Trip ${name} query failed: ${result.error.message}`);
  }

  const { vehicle, operator, business_unit: businessUnit, ...row } = trip;
  return {
    trip: row,
    load,
    agreedPriceCents: agreed.data?.agreed_price_cents ?? null,
    unitName: vehicle ? unitLabel(vehicle) : null,
    operatorName: operator?.full_name ?? null,
    businessUnitName: businessUnit?.name ?? null,
    events: events.data ?? [],
    incidents: incidents.data ?? [],
    evidence: evidence.data ?? [],
    documents: documents.data ?? [],
    /** What the trip still needs (trip_checklist, D22). */
    checklist: checklist.data ?? [],
    /** Kinds the carrier side may upload (trip_document_requirements), in order. */
    uploadableKinds: uploadableTripDocumentKinds(requirements.data ?? [], 'carrier'),
    // Oldest first, to draw the trail in order.
    locations: (locations.data ?? []).reverse(),
    conversationId: conversation.data?.id ?? null,
    /**
     * The internal chat with the operator (H1, D28), or null when hidden: a
     * hombre-camión working alone would only talk to themself (D13-E1).
     */
    internalConversationId: hidesInternalChat({
      isOwnerOperator: company.data?.is_owner_operator === true,
      staffCount: staff.count ?? 0,
    })
      ? null
      : (internalConversation.data?.id ?? null),
    assignment,
  };
}

export type CarrierTripDetail = NonNullable<Awaited<ReturnType<typeof getCarrierTrip>>>;
