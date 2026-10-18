import { createHash, randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  candidateFromRow,
  DEFAULT_TOP_N,
  evidenceStoragePath,
  matchExplanation,
  recommend,
  toRecommendation,
  type Database,
  type Recommendation,
  type TripEventType,
} from '@transport/shared';

import { DEMO_PASSWORD, users, type DemoUser } from './demo';
import { supabaseSettings } from './env';

// The carrier and the operator use the mobile app, which Playwright cannot
// drive (their UI flows are the Maestro flows in apps/mobile/.maestro). Here
// they act through the same RPCs the app calls, with their own JWT and the
// anon key: RLS and every RPC check apply exactly as on the phone.

export type Client = SupabaseClient<Database>;

/** A Supabase client signed in as a demo user (no session persistence). */
export async function signInAs(user: DemoUser): Promise<Client> {
  const { url, anonKey } = supabaseSettings();
  const client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: users[user],
    password: DEMO_PASSWORD,
  });
  if (error) throw new Error(`Sign-in of ${users[user]} failed: ${error.message}`);
  return client;
}

function check<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error) throw new Error(error.message);
  if (data === null || data === undefined) throw new Error('empty response');
  return data;
}

/**
 * Recommendations of one unit, as the carrier's home screen asks for them:
 * the Edge Function `recommendations` (B08) and, when it is not served, the
 * same candidates scored with the shared pure code (apps/mobile loads-api).
 */
export async function recommendationsFor(
  carrier: Client,
  vehicleId: string,
): Promise<{ source: 'edge-function' | 'local-scoring'; recommendations: Recommendation[] }> {
  const { data, error } = await carrier.functions.invoke<{ recommendations: Recommendation[] }>(
    'recommendations',
    { body: { vehicleId, limit: DEFAULT_TOP_N } },
  );
  if (!error && data && Array.isArray(data.recommendations)) {
    return { source: 'edge-function', recommendations: data.recommendations };
  }
  const rows = check(
    await carrier.rpc('match_candidates', { p_vehicle_id: vehicleId, p_limit: 200 }),
  );
  const scored = await recommend(rows.map(candidateFromRow), { topN: DEFAULT_TOP_N });
  return {
    source: 'local-scoring',
    recommendations: scored.map((m) => toRecommendation(m, matchExplanation(m.breakdown))),
  };
}

/** Carrier: first offer on a load (make_offer). Returns the offer id. */
export async function makeOffer(
  carrier: Client,
  input: { loadId: string; amountCents: number; vehicleId: string; conditions?: string },
): Promise<string> {
  return check(
    await carrier.rpc('make_offer', {
      p_load_id: input.loadId,
      p_amount_cents: input.amountCents,
      p_vehicle_id: input.vehicleId,
      ...(input.conditions ? { p_conditions: input.conditions } : {}),
    }),
  );
}

/** The pending offer of the other party on a load, as the carrier sees it. */
export async function pendingShipperOffer(carrier: Client, loadId: string): Promise<string> {
  const offer = check(
    await carrier
      .from('offers')
      .select('id')
      .eq('load_id', loadId)
      .eq('side', 'shipper')
      .eq('status', 'pending')
      .maybeSingle(),
  );
  return offer.id;
}

/** The carrier's pending offer on a load, as the shipper sees it (null when none). */
export async function pendingCarrierOffer(shipper: Client, loadId: string): Promise<string | null> {
  const { data, error } = await shipper
    .from('offers')
    .select('id')
    .eq('load_id', loadId)
    .eq('side', 'carrier')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

/** Shipper: accepts a pending carrier offer (accept_offer contracts the load and creates the trip). */
export async function acceptOffer(shipper: Client, offerId: string): Promise<void> {
  const { error } = await shipper.rpc('accept_offer', { p_offer_id: offerId });
  if (error) throw new Error(error.message);
}

/** Carrier: answers the shipper's counteroffer with a new amount. */
export async function counterOffer(
  carrier: Client,
  offerId: string,
  amountCents: number,
): Promise<string> {
  return check(
    await carrier.rpc('counter_offer', { p_offer_id: offerId, p_amount_cents: amountCents }),
  );
}

export interface TripRow {
  id: string;
  status: Database['public']['Enums']['trip_status'];
  created_at: string;
  estimated_unload_end_at: string | null;
  delivered_at: string | null;
}

/** A trip visible to the client (RLS), by id or by its load. */
export async function findTrip(
  client: Client,
  by: { tripId: string } | { loadId: string },
): Promise<TripRow> {
  const query = client
    .from('trips')
    .select('id, status, created_at, estimated_unload_end_at, delivered_at');
  const filtered = 'tripId' in by ? query.eq('id', by.tripId) : query.eq('load_id', by.loadId);
  return check(await filtered.maybeSingle());
}

/** Carrier: assigns unit and operator to a contracted trip (assign_trip). */
export async function assignTrip(
  carrier: Client,
  input: { tripId: string; vehicleId: string; operatorId: string },
): Promise<void> {
  const { error } = await carrier.rpc('assign_trip', {
    p_trip_id: input.tripId,
    p_vehicle_id: input.vehicleId,
    p_operator_id: input.operatorId,
  });
  if (error) throw new Error(error.message);
}

/** Operator: records a status event with time and place (record_trip_event). */
export async function recordTripEvent(
  operator: Client,
  input: {
    tripId: string;
    event: TripEventType;
    at: { lat: number; lng: number };
    receivedBy?: string;
  },
): Promise<void> {
  const { error } = await operator.rpc('record_trip_event', {
    p_trip_id: input.tripId,
    p_event_type: input.event,
    p_occurred_at: new Date().toISOString(),
    p_latitude: input.at.lat,
    p_longitude: input.at.lng,
    p_client_event_id: randomUUID(),
    ...(input.receivedBy ? { p_received_by_name: input.receivedBy } : {}),
  });
  if (error) throw new Error(error.message);
}

/** Smallest valid JPEG (1×1 px): the content of the test evidence photos. */
const PIXEL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

/**
 * Operator: uploads one evidence photo to the private `evidence` bucket and
 * registers it (add_trip_evidence), as the evidence queue of the app does (B23).
 */
export async function addEvidencePhoto(
  operator: Client,
  input: { tripId: string; stage: 'pickup' | 'delivery'; at: { lat: number; lng: number } },
): Promise<void> {
  const path = evidenceStoragePath({
    tripId: input.tripId,
    stage: input.stage,
    fileId: randomUUID(),
  });
  // A different byte per photo, so each one has its own hash.
  const bytes = Buffer.concat([PIXEL_JPEG, Buffer.from(randomUUID())]);
  const uploaded = await operator.storage
    .from('evidence')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (uploaded.error) throw new Error(uploaded.error.message);
  const { error } = await operator.rpc('add_trip_evidence', {
    p_trip_id: input.tripId,
    p_stage: input.stage,
    p_storage_path: path,
    p_sha256: createHash('sha256').update(bytes).digest('hex'),
    p_captured_at: new Date().toISOString(),
    p_latitude: input.at.lat,
    p_longitude: input.at.lng,
  });
  if (error) throw new Error(error.message);
}

/** Minimum photos of a stage (trip_evidence_requirements, configurable by the admin). */
export async function minimumPhotos(client: Client, stage: 'pickup' | 'delivery'): Promise<number> {
  const row = check(
    await client
      .from('trip_evidence_requirements')
      .select('min_photos')
      .eq('stage', stage)
      .maybeSingle(),
  );
  return row.min_photos;
}
