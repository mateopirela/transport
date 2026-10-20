import 'server-only';

import {
  createRoadSuggester,
  parseRoadCatalog,
  ROAD_PREFERENCE_SELECT,
  vehicleAxles,
  type CarrierRoadPreferenceRow,
  type RoadContext,
  type RoadPreference,
  type Tables,
} from '@transport/shared';

import type { Supabase } from '../viewer';

// Road intelligence on the carrier web (H4): the catalog (road_catalog, read
// by everyone signed in) and the company's road preferences (RLS). The
// suggestion itself is the pure code of packages/shared/roads, the same the
// Edge Function `recommendations` runs.

/** The catalog and the caller's preferences; empty (never an error) when unavailable. */
export async function loadRoadContext(supabase: Supabase): Promise<RoadContext> {
  const [catalog, preferences] = await Promise.all([
    supabase.rpc('road_catalog'),
    supabase
      .from('carrier_road_preferences')
      .select(ROAD_PREFERENCE_SELECT)
      .is('archived_at', null),
  ]);
  return {
    corridors: catalog.error ? [] : parseRoadCatalog(catalog.data),
    preferences: preferences.error ? [] : (preferences.data as CarrierRoadPreferenceRow[]),
  };
}

/** The suggester the local recommendations fallback scores with (lib/carrier/loads.ts). */
export async function roadSuggesterFor(
  supabase: Supabase,
  units: readonly Pick<Tables<'vehicles'>, 'id' | 'kind' | 'unit_type' | 'axle_count'>[],
) {
  const context = await loadRoadContext(supabase);
  return createRoadSuggester({
    ...context,
    axlesByVehicle: new Map(units.map((u) => [u.id, vehicleAxles(u)])),
  });
}

export interface RoutePreference {
  id: string;
  carrierRouteId: string | null;
  segmentId: string;
  preference: RoadPreference;
}

/** The company's active road preferences, for the usual routes screen. */
export async function listRoadPreferences(
  supabase: Supabase,
  companyId: string,
): Promise<RoutePreference[]> {
  const { data, error } = await supabase
    .from('carrier_road_preferences')
    .select('id, carrier_route_id, segment_id, preference')
    .eq('company_id', companyId)
    .is('archived_at', null)
    .order('created_at');
  if (error) throw new Error(`Road preferences query failed: ${error.message}`);
  return data.map((p) => ({
    id: p.id,
    carrierRouteId: p.carrier_route_id,
    segmentId: p.segment_id,
    preference: p.preference,
  }));
}
