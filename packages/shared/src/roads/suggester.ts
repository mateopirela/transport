// The road suggestion of each recommendation (H4): the same inputs the Edge
// Function `recommendations` and the apps' local fallback read (the catalog,
// the carrier's preferences with their routes and the units' axles), turned
// into one function per candidate.
import type { UnitType, VehicleKind } from '../enums';
import { fromEwkbPoint, type LatLng } from '../geo';
import type { MatchCandidate } from '../matching/scoring';
import {
  preferencesForLoad,
  type RoadCorridor,
  type RoadPreference,
  type RoadSegment,
} from './catalog';
import { defaultAxleCount, suggestRoute, type RoadSuggestion } from './suggest';

/** A carrier_road_preferences row with its route (null = every route). */
export interface CarrierRoadPreferenceRow {
  segment_id: string;
  preference: RoadPreference;
  carrier_routes: {
    origin_city: string;
    destination_city: string;
    /** geography(Point) as PostgREST returns it (hex EWKB), when stored. */
    origin_location?: unknown;
    destination_location?: unknown;
    archived_at?: string | null;
  } | null;
}

/** Columns of carrier_road_preferences the suggester reads, with the route's cities. */
export const ROAD_PREFERENCE_SELECT =
  'segment_id, preference, carrier_routes(origin_city, destination_city, origin_location, destination_location, archived_at)';

/** Axles of a unit: its own, or the default of its kind and body. */
export function vehicleAxles(vehicle: {
  kind: VehicleKind;
  unit_type: UnitType | null;
  axle_count: number | null;
}): number {
  return vehicle.axle_count ?? defaultAxleCount(vehicle.kind, vehicle.unit_type);
}

export interface RoadSuggesterInput {
  corridors: readonly RoadCorridor[];
  preferences: readonly CarrierRoadPreferenceRow[];
  /** Axles per vehicle id; a unit not listed counts as a tractor-trailer. */
  axlesByVehicle: ReadonlyMap<string, number>;
}

/**
 * The suggested road of a candidate: from its pickup, leaving when the pickup
 * window opens, with the axles of its unit and the preferences that apply to
 * the load's cities.
 */
export function createRoadSuggester({
  corridors,
  preferences,
  axlesByVehicle,
}: RoadSuggesterInput): (candidate: MatchCandidate) => RoadSuggestion {
  const rows = preferenceRows(preferences);
  return (candidate) =>
    suggestRoute({
      origin: candidate.origin,
      destination: candidate.destination,
      departAt: candidate.pickupWindowStart,
      axleCount: axlesByVehicle.get(candidate.vehicleId) ?? defaultAxleCount('tractor', null),
      corridors,
      preferences: preferencesForLoad(rows, {
        origin: { city: candidate.origin.city, point: candidate.origin },
        destination: { city: candidate.destination.city, point: candidate.destination },
      }),
    });
}

/** The rows in the shape of preferencesForLoad; those of archived routes no longer apply. */
function preferenceRows(preferences: readonly CarrierRoadPreferenceRow[]) {
  return preferences
    .filter((p) => !p.carrier_routes?.archived_at)
    .map((p) => ({
      segmentId: p.segment_id,
      preference: p.preference,
      route: p.carrier_routes
        ? {
            origin: {
              city: p.carrier_routes.origin_city,
              point: fromEwkbPoint(p.carrier_routes.origin_location),
            },
            destination: {
              city: p.carrier_routes.destination_city,
              point: fromEwkbPoint(p.carrier_routes.destination_location),
            },
          }
        : null,
    }));
}

/** The catalog and the carrier's preferences, as the apps read them. */
export interface RoadContext {
  corridors: readonly RoadCorridor[];
  preferences: readonly CarrierRoadPreferenceRow[];
}

/** A load as the road suggestion needs it (columns of `loads`). */
export interface RoadLoad {
  origin_city: string;
  origin_lat: number;
  origin_lng: number;
  destination_city: string;
  destination_lat: number;
  destination_lng: number;
  pickup_window_start: string;
}

/** The suggested route of a load (detail screens), leaving when its pickup window opens. */
export function suggestLoadRoad(
  context: RoadContext,
  load: RoadLoad,
  axleCount: number,
): RoadSuggestion {
  return suggestRoute({
    origin: { lat: load.origin_lat, lng: load.origin_lng },
    destination: { lat: load.destination_lat, lng: load.destination_lng },
    departAt: load.pickup_window_start,
    axleCount,
    corridors: context.corridors,
    preferences: preferencesForLoad(preferenceRows(context.preferences), {
      origin: { city: load.origin_city, point: { lat: load.origin_lat, lng: load.origin_lng } },
      destination: {
        city: load.destination_city,
        point: { lat: load.destination_lat, lng: load.destination_lng },
      },
    }),
  });
}

/**
 * Distinct segments of the corridors that serve a route between two points
 * (either direction if the corridor allows it), in corridor order: the
 * segments a carrier can prefer or avoid on that route.
 */
export function segmentsForRoute(
  corridors: readonly RoadCorridor[],
  origin: LatLng | null,
  destination: LatLng | null,
): RoadSegment[] {
  if (!origin || !destination) return [];
  const byId = new Map<string, RoadSegment>();
  for (const corridor of corridors) {
    const served =
      suggestRoute({
        origin,
        destination,
        departAt: new Date(0),
        axleCount: 5,
        corridors: [corridor],
      }).source === 'catalog';
    if (served) for (const s of corridor.segments) if (!byId.has(s.id)) byId.set(s.id, s);
  }
  return [...byId.values()];
}
