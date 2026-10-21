import {
  createRoadSuggester,
  parseRoadCatalog,
  ROAD_PREFERENCE_SELECT,
  vehicleAxles,
  type CarrierRoadPreferenceRow,
  type MatchCandidate,
  type RoadContext,
  type RoadPreference,
  type RoadSuggestion,
} from '@transport/shared';

import type { Supabase } from './supabase';

// Road intelligence in the carrier app (H4, D31): the road catalog
// (road_catalog, read by everyone signed in), the company's road preferences
// (RLS) and the suggested road, with the same pure code as the Edge Function
// `recommendations` and the web. Roads are an extra: when they cannot be
// read, the screens show "Sin ruta en el catálogo" instead of failing.

const EMPTY: RoadContext = { corridors: [], preferences: [] };

/** The catalog and the caller's preferences; empty when they cannot be read. */
export async function loadRoadContext(client: Supabase): Promise<RoadContext> {
  try {
    const [catalog, preferences] = await Promise.all([
      client.rpc('road_catalog'),
      client
        .from('carrier_road_preferences')
        .select(ROAD_PREFERENCE_SELECT)
        .is('archived_at', null),
    ]);
    return {
      corridors: catalog.error ? [] : parseRoadCatalog(catalog.data),
      preferences: preferences.error ? [] : (preferences.data as CarrierRoadPreferenceRow[]),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * The road suggester of the local recommendations fallback, with the axles of
 * the given units; undefined (scores without roads) when it cannot be built.
 */
export async function roadSuggesterFor(
  client: Supabase,
  vehicleIds: readonly string[],
): Promise<((candidate: MatchCandidate) => RoadSuggestion) | undefined> {
  try {
    const [context, vehicles] = await Promise.all([
      loadRoadContext(client),
      client
        .from('vehicles')
        .select('id, kind, unit_type, axle_count')
        .in('id', [...vehicleIds]),
    ]);
    if (vehicles.error) return undefined;
    return createRoadSuggester({
      ...context,
      axlesByVehicle: new Map(vehicles.data.map((v) => [v.id, vehicleAxles(v)])),
    });
  } catch {
    return undefined;
  }
}

export interface RoutePreference {
  carrierRouteId: string | null;
  segmentId: string;
  preference: RoadPreference;
}

/** The company's active road preferences (usual routes screen). */
export async function listRoadPreferences(
  client: Supabase,
  companyId: string,
): Promise<RoutePreference[]> {
  const { data, error } = await client
    .from('carrier_road_preferences')
    .select('carrier_route_id, segment_id, preference')
    .eq('company_id', companyId)
    .is('archived_at', null)
    .order('created_at');
  if (error) throw error;
  return data.map((p) => ({
    carrierRouteId: p.carrier_route_id,
    segmentId: p.segment_id,
    preference: p.preference,
  }));
}

/** Marks a segment as preferred or avoided on a route; null clears it. */
export async function setRoadPreference(
  client: Supabase,
  routeId: string,
  segmentId: string,
  preference: RoadPreference | null,
): Promise<void> {
  const { error } = await client.rpc('set_carrier_road_preference', {
    p_carrier_route_id: routeId,
    p_segment_id: segmentId,
    ...(preference ? { p_preference: preference } : {}),
  });
  if (error) throw error;
}
