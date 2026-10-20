// Recommendation pipeline (B08): rank every candidate with estimated
// distances, resolve road distances only for the top N (bounded Maps cost),
// re-score them and return them best first.
import type { Database } from '../db';
import type { RoadSuggestion } from '../roads/suggest';
import { estimateLeg, legKey, type DistanceResolver, type Leg } from './distance';
import {
  DEFAULT_MATCHING_WEIGHTS,
  rankMatches,
  scoreCandidate,
  type CandidateDistances,
  type LegDistance,
  type MatchCandidate,
  type MatchingWeights,
  type RoadScoreInput,
  type ScoredMatch,
} from './scoring';

/** Default number of candidates that get road distances (and are returned). */
export const DEFAULT_TOP_N = 10;
export const MAX_TOP_N = 20;

/** A match_candidates row, as PostgREST returns it. */
export type MatchCandidateRow = Database['public']['CompositeTypes']['match_candidate'];

function required<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined)
    throw new TypeError(`match_candidate.${field} is missing`);
  return value;
}

/** Maps a match_candidates row to the scoring input. */
export function candidateFromRow(row: MatchCandidateRow): MatchCandidate {
  const place = (prefix: 'start' | 'origin' | 'destination') => ({
    city: required(row[`${prefix}_city`], `${prefix}_city`),
    state: required(row[`${prefix}_state`], `${prefix}_state`),
    lat: required(row[`${prefix}_lat`], `${prefix}_lat`),
    lng: required(row[`${prefix}_lng`], `${prefix}_lng`),
  });
  return {
    loadId: required(row.load_id, 'load_id'),
    vehicleId: required(row.vehicle_id, 'vehicle_id'),
    start: place('start'),
    availableFrom: required(row.available_from, 'available_from'),
    isReturnTrip: row.is_return_trip === true,
    origin: place('origin'),
    destination: place('destination'),
    pickupWindowStart: required(row.pickup_window_start, 'pickup_window_start'),
    pickupWindowEnd: required(row.pickup_window_end, 'pickup_window_end'),
    proposedPriceCents: Number(required(row.proposed_price_cents, 'proposed_price_cents')),
    homeDistanceKm: row.home_distance_km ?? null,
    matchedRoute:
      row.route_origin_city && row.route_destination_city
        ? { originCity: row.route_origin_city, destinationCity: row.route_destination_city }
        : null,
  };
}

const emptyLeg = (c: MatchCandidate): Leg => ({ from: c.start, to: c.origin });
const loadedLeg = (c: MatchCandidate): Leg => ({ from: c.origin, to: c.destination });

export interface RecommendOptions {
  weights?: MatchingWeights;
  topN?: number;
  roadFactor?: number;
  now?: Date;
  /** Road distances (cache + Google Routes). Without it, every leg is estimated. */
  resolveDistances?: DistanceResolver;
  /**
   * Suggested road of a candidate (H4, createRoadSuggester). Its tolls and
   * high-risk crossings enter the score; without it the score ignores roads.
   */
  suggestRoad?: (candidate: MatchCandidate) => RoadSuggestion;
}

function roadScore(road: RoadSuggestion | undefined): RoadScoreInput | null {
  return road && road.source === 'catalog'
    ? {
        tollsCents: road.tollsCents,
        tollsMissing: road.tollsMissing,
        highRiskCount: road.highRiskCount,
      }
    : null;
}

/** The top N candidates, best first, scored with road distances when available. */
export async function recommend(
  candidates: readonly MatchCandidate[],
  options: RecommendOptions = {},
): Promise<ScoredMatch[]> {
  const weights = options.weights ?? DEFAULT_MATCHING_WEIGHTS;
  const topN = Math.min(Math.max(Math.trunc(options.topN ?? DEFAULT_TOP_N), 1), MAX_TOP_N);
  const now = options.now ?? new Date();
  const estimate = (leg: Leg) => estimateLeg(leg, options.roadFactor);
  // One road per load and unit (the unit's axles pick the toll class).
  const roads = new Map<string, RoadSuggestion | undefined>();
  const roadOf = (c: MatchCandidate) => {
    const key = `${c.loadId}|${c.vehicleId}`;
    if (!roads.has(key)) roads.set(key, options.suggestRoad?.(c));
    return roads.get(key);
  };
  const score = (c: MatchCandidate, distances: CandidateDistances): ScoredMatch | null => {
    const road = roadOf(c);
    const scored = scoreCandidate(c, distances, weights, now, roadScore(road));
    return scored && road ? { ...scored, road } : scored;
  };

  // 1. Every candidate with estimates (no Maps calls).
  const estimated = candidates
    .map((c) => score(c, { empty: estimate(emptyLeg(c)), loaded: estimate(loadedLeg(c)) }))
    .filter((m): m is ScoredMatch => m !== null);
  const top = rankMatches(estimated).slice(0, topN);
  if (!options.resolveDistances || top.length === 0) return top;

  // 2. Road distances for the top N only: at most 2N legs, deduplicated.
  const legs = top.flatMap(({ candidate }) => [emptyLeg(candidate), loadedLeg(candidate)]);
  const resolved = await options.resolveDistances(legs);
  const distance = (leg: Leg): LegDistance => resolved.get(legKey(leg)) ?? estimate(leg);

  // 3. Re-score; a unit that cannot arrive in time by road drops out.
  const rescored = top
    .map(({ candidate }) =>
      score(candidate, {
        empty: distance(emptyLeg(candidate)),
        loaded: distance(loadedLeg(candidate)),
      }),
    )
    .filter((m): m is ScoredMatch => m !== null);
  return rankMatches(rescored);
}
