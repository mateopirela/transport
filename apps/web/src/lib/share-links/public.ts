import 'server-only';

import {
  isShareToken,
  publicSharedLoadSchema,
  publicSharedTripSchema,
  type PublicSharedLoad,
  type PublicSharedTrip,
} from '@transport/shared';

import { createAnonClient } from '../supabase/anon';

export type PublicShare =
  { kind: 'trip'; data: PublicSharedTrip } | { kind: 'load'; data: PublicSharedLoad };

/** The RPCs answer 42501 for an unknown, expired or revoked token (all alike). */
const NOT_AVAILABLE = '42501';

/**
 * What a public link shows, or null when it is not available: unknown,
 * expired or revoked token, or a document that does not match the strict
 * schema (a key the RPC never promised fails closed rather than reaching the
 * page). The token says nothing about its kind, so the tracking RPC is tried
 * first and the load one second; a refused call counts no view.
 */
export async function fetchPublicShare(token: string): Promise<PublicShare | null> {
  if (!isShareToken(token)) return null;
  const supabase = createAnonClient();
  if (!supabase) return null;

  const trip = await supabase.rpc('public_shared_trip', { p_token: token });
  if (!trip.error) {
    const parsed = publicSharedTripSchema.safeParse(trip.data);
    return parsed.success ? { kind: 'trip', data: parsed.data } : null;
  }
  if (trip.error.code !== NOT_AVAILABLE) {
    throw new Error(`Shared trip query failed: ${trip.error.message}`);
  }

  const load = await supabase.rpc('public_shared_load', { p_token: token });
  if (load.error) {
    if (load.error.code === NOT_AVAILABLE) return null;
    throw new Error(`Shared load query failed: ${load.error.message}`);
  }
  const parsed = publicSharedLoadSchema.safeParse(load.data);
  return parsed.success ? { kind: 'load', data: parsed.data } : null;
}
