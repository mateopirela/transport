// Edge Function `recommendations` (B08): ranked loads for one unit of the
// caller, with an explainable breakdown.
//
//   POST { vehicleId } | { availabilityId }, optional maxEmptyKm and limit.
//
// 1. Candidates come from the match_candidates RPC called with the caller's
//    JWT: Postgres checks that the unit belongs to the caller's approved
//    company. The service role never chooses what the caller can see.
// 2. Scoring and the top N live in packages/shared/matching (pure, tested).
// 3. Road distances: route_distance_cache first (service role), then Google
//    Routes for the misses of the top N only. Without GOOGLE_ROUTES_API_KEY
//    (or the service role, i.e. no cache) Routes is never called and every
//    distance is haversine × ROAD_DISTANCE_FACTOR.
import { matchExplanation } from '../../../packages/shared/src/copy/matching.ts';
import { roadDistanceFactor } from '../../../packages/shared/src/geo.ts';
import {
  candidateFromRow,
  createRoutesResolver,
  DEFAULT_TOP_N,
  MAX_TOP_N,
  parseMatchingWeights,
  recommend,
  type CachedDistance,
  type DistanceCache,
  type Leg,
  type MatchCandidate,
  type MatchCandidateRow,
} from '../../../packages/shared/src/matching/index.ts';
import { createLogger, type Logger } from '../../../packages/shared/src/observability/logger.ts';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface Dependencies {
  env: (name: string) => string | undefined;
  fetch: FetchLike;
  now?: () => Date;
  /** Structured logger of the request (B25); a plain one when not given. */
  log?: Logger;
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-request-id',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Candidates scored with estimates; only the top N get road distances. */
const MAX_CANDIDATES = 200;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

interface Input {
  vehicleId: string | null;
  availabilityId: string | null;
  maxEmptyKm: number | null;
  limit: number;
}

function parseInput(body: unknown): Input | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const { vehicleId, availabilityId, maxEmptyKm, limit } = body as Record<string, unknown>;
  const id = (value: unknown) => (typeof value === 'string' && UUID.test(value) ? value : null);
  const vehicle = id(vehicleId);
  const availability = id(availabilityId);
  if ((vehicleId !== undefined && !vehicle) || (availabilityId !== undefined && !availability))
    return null;
  if (!vehicle === !availability) return null;
  const integer = (value: unknown, min: number, max: number) =>
    Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
  if (maxEmptyKm !== undefined && !integer(maxEmptyKm, 1, 500)) return null;
  if (limit !== undefined && !integer(limit, 1, MAX_TOP_N)) return null;
  return {
    vehicleId: vehicle,
    availabilityId: availability,
    maxEmptyKm: (maxEmptyKm as number | undefined) ?? null,
    limit: (limit as number | undefined) ?? DEFAULT_TOP_N,
  };
}

/** PostgREST headers for a key: new secret keys go only in `apikey`. */
function serviceHeaders(key: string): Record<string, string> {
  return key.startsWith('sb_')
    ? { apikey: key, 'Content-Type': 'application/json' }
    : { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

/** route_distance_cache through its service-role-only RPCs. */
export function restDistanceCache(
  supabaseUrl: string,
  serviceKey: string,
  fetch: FetchLike,
): DistanceCache {
  const call = async (fn: string, legs: unknown[]) => {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: serviceHeaders(serviceKey),
      body: JSON.stringify({ p_legs: legs }),
    });
    if (!response.ok) throw new Error(`${fn} failed with ${response.status}`);
    return response;
  };
  const legJson = ({ from, to }: Leg) => ({
    originLat: from.lat,
    originLng: from.lng,
    destinationLat: to.lat,
    destinationLng: to.lng,
  });
  return {
    async get(legs) {
      const rows = (await (await call('get_route_distances', legs.map(legJson))).json()) as {
        origin_lat: number;
        origin_lng: number;
        destination_lat: number;
        destination_lng: number;
        distance_km: number;
        duration_minutes: number;
      }[];
      return rows.map((row): CachedDistance => ({
        leg: {
          from: { lat: Number(row.origin_lat), lng: Number(row.origin_lng) },
          to: { lat: Number(row.destination_lat), lng: Number(row.destination_lng) },
        },
        km: Number(row.distance_km),
        minutes: Number(row.duration_minutes),
      }));
    },
    async put(entries) {
      await call(
        'put_route_distances',
        entries.map((e) => ({ ...legJson(e.leg), distanceKm: e.km, durationMinutes: e.minutes })),
      );
    },
  };
}

export async function handleRecommendations(
  request: Request,
  deps: Dependencies,
): Promise<Response> {
  const log = deps.log ?? createLogger({ service: 'recommendations' });
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = deps.env('SUPABASE_URL');
  const anonKey = deps.env('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return json({ error: 'not_configured' }, 500);

  let input: Input | null = null;
  try {
    input = parseInput(await request.json());
  } catch {
    // Invalid JSON: same answer as an invalid body.
  }
  if (!input) return json({ error: 'invalid_request' }, 400);

  let candidates: MatchCandidate[];
  try {
    const rpc = await deps.fetch(`${supabaseUrl}/rest/v1/rpc/match_candidates`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_vehicle_id: input.vehicleId,
        p_availability_id: input.availabilityId,
        ...(input.maxEmptyKm === null ? {} : { p_max_empty_km: input.maxEmptyKm }),
        p_limit: MAX_CANDIDATES,
      }),
    });
    if (!rpc.ok) {
      const error = (await rpc.json().catch(() => ({}))) as { code?: string };
      if (rpc.status === 401) return json({ error: 'unauthorized' }, 401);
      if (error.code === '42501') return json({ error: 'forbidden' }, 403);
      if (error.code === '22023') return json({ error: 'invalid_request' }, 400);
      log.error('match_candidates failed', { status: rpc.status, code: error.code });
      return json({ error: 'upstream_error' }, 502);
    }
    candidates = ((await rpc.json()) as MatchCandidateRow[]).map(candidateFromRow);
  } catch (error) {
    // Connection failure or a malformed answer: same JSON error, with CORS.
    log.error('match_candidates failed', { error });
    return json({ error: 'upstream_error' }, 502);
  }

  const serviceKey = deps.env('SUPABASE_SERVICE_ROLE_KEY');
  const resolveDistances = serviceKey
    ? createRoutesResolver({
        apiKey: deps.env('GOOGLE_ROUTES_API_KEY') || undefined,
        cache: restDistanceCache(supabaseUrl, serviceKey, deps.fetch),
        fetch: deps.fetch,
        // Two legs per recommendation (empty and loaded): the cost bound.
        maxRequests: 2 * input.limit,
      })
    : undefined;

  const matches = await recommend(candidates, {
    weights: parseMatchingWeights(deps.env('MATCHING_WEIGHTS')),
    topN: input.limit,
    roadFactor: roadDistanceFactor(deps.env('ROAD_DISTANCE_FACTOR')),
    now: deps.now?.() ?? new Date(),
    resolveDistances,
  });

  log.info('recommendations served', {
    candidates: candidates.length,
    recommendations: matches.length,
    returnTrips: matches.filter((m) => m.breakdown.isReturnTrip).length,
    roadDistances: Boolean(resolveDistances),
  });
  return json({
    candidates: candidates.length,
    recommendations: matches.map(({ candidate, score, breakdown }) => ({
      loadId: candidate.loadId,
      vehicleId: candidate.vehicleId,
      origin: candidate.origin,
      destination: candidate.destination,
      pickupWindowStart: candidate.pickupWindowStart,
      pickupWindowEnd: candidate.pickupWindowEnd,
      proposedPriceCents: candidate.proposedPriceCents,
      score,
      explanation: matchExplanation(breakdown),
      breakdown,
    })),
  });
}
