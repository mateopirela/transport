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

/**
 * Coordinates of a `geography(Point, 4326)` as PostgREST returns it: hex
 * EWKB (byte order, type with the SRID flag, SRID, then longitude and
 * latitude as doubles). Null for anything else.
 */
export function fromEwkbPoint(value: unknown): { lat: number; lng: number } | null {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2}){25}$/iu.test(value)) return null;
  const bytes = Uint8Array.from({ length: value.length / 2 }, (_, i) =>
    Number.parseInt(value.slice(2 * i, 2 * i + 2), 16),
  );
  const view = new DataView(bytes.buffer);
  const little = bytes[0] === 1;
  if (!little && bytes[0] !== 0) return null;
  const type = view.getUint32(1, little);
  if (type !== 0x20000001 || view.getUint32(5, little) !== 4326) return null;
  const lng = view.getFloat64(9, little);
  const lat = view.getFloat64(17, little);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return { lat, lng };
}
