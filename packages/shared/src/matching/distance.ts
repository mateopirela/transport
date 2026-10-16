// Road distances for matching (B08). Google Routes is called only for the
// top N candidates and only through route_distance_cache: a leg is looked up
// in the cache first, and every answer from Routes is stored. Without an API
// key or a cache, every leg is an estimate: haversine × road factor.
import { estimateRoadKm, type LatLng } from '../geo';
import type { LegDistance } from './scoring';

/** Average truck speed used to estimate driving time without Routes. */
export const ESTIMATED_TRUCK_SPEED_KMH = 60;

/** Cache key precision: 2 decimals (~1 km). Routes is asked for the rounded points. */
export const roundCoordinate = (value: number) => Math.round(value * 100) / 100;

export interface Leg {
  from: LatLng;
  to: LatLng;
}

/** A leg with both points rounded, as cached and as sent to Routes. */
export function roundLeg(leg: Leg): Leg {
  const point = (p: LatLng) => ({ lat: roundCoordinate(p.lat), lng: roundCoordinate(p.lng) });
  return { from: point(leg.from), to: point(leg.to) };
}

export function legKey(leg: Leg): string {
  const { from, to } = roundLeg(leg);
  return `${from.lat.toFixed(2)},${from.lng.toFixed(2)}>${to.lat.toFixed(2)},${to.lng.toFixed(2)}`;
}

export function estimateLeg(leg: Leg, roadFactor?: number): LegDistance {
  const km = estimateRoadKm(leg.from, leg.to, roadFactor);
  return { km, minutes: (km / ESTIMATED_TRUCK_SPEED_KMH) * 60, source: 'estimate' };
}

export interface CachedDistance {
  leg: Leg;
  km: number;
  minutes: number;
}

/** route_distance_cache (get_route_distances / put_route_distances). */
export interface DistanceCache {
  get(legs: readonly Leg[]): Promise<CachedDistance[]>;
  put(entries: readonly CachedDistance[]): Promise<void>;
}

/** Resolves road distances for some legs; legs it cannot resolve are left out. */
export type DistanceResolver = (legs: readonly Leg[]) => Promise<Map<string, LegDistance>>;

export const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * One Routes request (Compute Routes, essentials: no traffic, only distance
 * and duration in the field mask). Returns null when Routes has no route or
 * fails; the caller falls back to the estimate.
 */
export async function fetchRouteDistance(
  leg: Leg,
  options: { apiKey: string; fetch: FetchLike; timeoutMs?: number },
): Promise<{ km: number; minutes: number } | null> {
  const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const response = await options.fetch(GOOGLE_ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': options.apiKey,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify({
      origin: point(leg.from),
      destination: point(leg.to),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    routes?: { distanceMeters?: unknown; duration?: unknown }[];
  };
  const route = body.routes?.[0];
  const meters = route?.distanceMeters;
  const seconds =
    typeof route?.duration === 'string' ? Number(route.duration.replace(/s$/u, '')) : NaN;
  if (
    typeof meters !== 'number' ||
    !Number.isFinite(meters) ||
    meters < 0 ||
    !Number.isFinite(seconds)
  ) {
    return null;
  }
  return { km: meters / 1000, minutes: seconds / 60 };
}

/**
 * Cache first, then Routes for the misses (at most `maxRequests` per call,
 * in parallel), storing every answer. Without an API key only the cache is
 * used. Errors are logged without the key and the leg stays unresolved
 * (estimated by the caller).
 */
export function createRoutesResolver(options: {
  apiKey: string | undefined;
  cache: DistanceCache;
  fetch: FetchLike;
  maxRequests: number;
  timeoutMs?: number;
}): DistanceResolver {
  return async (legs) => {
    const unique = new Map(legs.map((leg) => [legKey(leg), roundLeg(leg)]));
    const result = new Map<string, LegDistance>();
    if (unique.size === 0) return result;

    try {
      for (const hit of await options.cache.get([...unique.values()])) {
        result.set(legKey(hit.leg), { km: hit.km, minutes: hit.minutes, source: 'cache' });
      }
    } catch (error) {
      // Without the cache, Routes is not called (its cost must stay bounded).
      console.error(
        'route_distance_cache read failed',
        error instanceof Error ? error.message : error,
      );
      return result;
    }

    const apiKey = options.apiKey;
    if (!apiKey) return result;
    const misses = [...unique.entries()]
      .filter(([key]) => !result.has(key))
      .slice(0, options.maxRequests);
    const fetched: CachedDistance[] = [];
    await Promise.all(
      misses.map(async ([key, leg]) => {
        try {
          const distance = await fetchRouteDistance(leg, { ...options, apiKey });
          if (distance) {
            result.set(key, { ...distance, source: 'routes' });
            fetched.push({ leg, ...distance });
          }
        } catch (error) {
          console.error(
            'Google Routes request failed',
            error instanceof Error ? error.name : error,
          );
        }
      }),
    );
    if (fetched.length > 0) {
      try {
        await options.cache.put(fetched);
      } catch (error) {
        console.error(
          'route_distance_cache write failed',
          error instanceof Error ? error.message : error,
        );
      }
    }
    return result;
  };
}
