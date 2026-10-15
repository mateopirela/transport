// Straight-line and estimated road distances (no Maps key needed). Real road
// distances come from Google Routes through route_distance_cache (B08); this
// is the fallback the plan asks for: haversine × a road factor.

/** Default ratio between road and straight-line distance (ROAD_DISTANCE_FACTOR). */
export const DEFAULT_ROAD_DISTANCE_FACTOR = 1.3;

const EARTH_RADIUS_KM = 6371.0088;

export interface LatLng {
  lat: number;
  lng: number;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in km between two points. */
export function haversineKm(a: LatLng, b: LatLng): number {
  for (const p of [a, b]) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90) {
      throw new RangeError(`Invalid coordinates: ${p.lat}, ${p.lng}`);
    }
  }
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Parses ROAD_DISTANCE_FACTOR; a missing or out-of-range value falls back to the default. */
export function roadDistanceFactor(value: string | undefined): number {
  const factor = Number(value);
  return value && Number.isFinite(factor) && factor >= 1 && factor <= 3
    ? factor
    : DEFAULT_ROAD_DISTANCE_FACTOR;
}

/** Estimated road distance in km: haversine × factor. */
export function estimateRoadKm(
  a: LatLng,
  b: LatLng,
  factor: number = DEFAULT_ROAD_DISTANCE_FACTOR,
): number {
  return haversineKm(a, b) * factor;
}
