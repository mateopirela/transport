// Trip link for the operator (H2, D29). The coordinator or the manager issues
// it after assigning (create_trip_operator_link) and sends it through the
// share sheet; the operator opens it with their session
// (open_trip_operator_link), which decides where it leads. Postgres owns
// every rule; the app only builds the link and parses the answer strictly.
import {
  isShareToken,
  openTripLinkSchema,
  tripDeepLink,
  tripLinkUrl,
  type OpenTripLink,
  type TripStatus,
} from '@transport/shared';

import type { Supabase } from './supabase';

// Public web URL (B27). Static access so Expo inlines it in the bundle.
const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL;

/**
 * What to send: the web page `/viaje/<token>` when the public site is
 * configured (it opens the app, or offers to download it, and shows nothing
 * of the trip), otherwise the app's deep link (local development).
 */
export function tripLinkTarget(siteUrl: string | undefined, token: string): string {
  return tripLinkUrl(siteUrl, token) ?? tripDeepLink(token);
}

/** Issues the link of a trip (revoking the previous one) and returns its URL. */
export async function createTripLink(client: Supabase, tripId: string): Promise<string> {
  const { data, error } = await client.rpc('create_trip_operator_link', { p_trip_id: tripId });
  const link = data?.[0];
  if (error || !link) throw new Error(error?.message ?? 'empty response');
  return tripLinkTarget(SITE_URL, link.token);
}

/**
 * Where a trip link leads the signed-in user, or null when it is not for them
 * (unknown, expired or revoked token, a trip that ended, someone else's).
 */
export async function openTripLink(client: Supabase, token: string): Promise<OpenTripLink | null> {
  if (!isShareToken(token)) return null;
  const { data, error } = await client.rpc('open_trip_operator_link', { p_token: token });
  if (error) {
    if (error.code === '22023' || error.code === '42501') return null;
    throw new Error(error.message);
  }
  const parsed = openTripLinkSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** The summary of the linked trip when it is not the one in course ("Siguiente viaje"). */
export interface LinkedTrip {
  id: string;
  status: TripStatus;
  origin: string;
  destination: string;
  pickupStart: string;
  pickupEnd: string;
}

/** The linked trip, as the operator reads it (RLS: assigned to them), or null. */
export async function loadLinkedTrip(client: Supabase, tripId: string): Promise<LinkedTrip | null> {
  const { data, error } = await client
    .from('trips')
    .select(
      'id, status, load:loads(origin_city, origin_state, destination_city, destination_state, pickup_window_start, pickup_window_end)',
    )
    .eq('id', tripId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.load) return null;
  const l = data.load;
  return {
    id: data.id,
    status: data.status,
    origin: `${l.origin_city}, ${l.origin_state}`,
    destination: `${l.destination_city}, ${l.destination_state}`,
    pickupStart: l.pickup_window_start,
    pickupEnd: l.pickup_window_end,
  };
}
