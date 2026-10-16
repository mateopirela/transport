// Matching V1 scoring (B08, D07: rules, no AI). Pure functions: the Edge
// Function `recommendations` feeds them the rows of match_candidates and the
// road distances; the apps render the breakdown with copy/matching.ts.
//
// Every ingredient adds or subtracts points, and the breakdown keeps each
// contribution, so a recommendation can always be explained and the weights
// tuned without touching the code (MATCHING_WEIGHTS).
import type { LatLng } from '../geo';

export interface MatchingWeights {
  /** Points per MXN earned per total km (empty + loaded). In favor. */
  pricePerKm: number;
  /** Points subtracted per empty km to the pickup. */
  emptyKm: number;
  /** Points subtracted per idle hour between availability and pickup. */
  idleHours: number;
  /** Idle hours beyond this count the same (a far future load is not -∞). */
  maxIdleHours: number;
  /** Bonus when the load follows one of the carrier's usual routes. */
  routeMatch: number;
  /** Bonus when, in return-trip mode, the load ends near the carrier's base. */
  returnHome: number;
  /** Straight-line radius around the base for the return bonus. */
  returnHomeRadiusKm: number;
}

export const DEFAULT_MATCHING_WEIGHTS: Readonly<MatchingWeights> = Object.freeze({
  pricePerKm: 2,
  emptyKm: 0.2,
  idleHours: 0.5,
  maxIdleHours: 96,
  routeMatch: 15,
  returnHome: 20,
  returnHomeRadiusKm: 75,
});

/**
 * Weights from a JSON object (e.g. the MATCHING_WEIGHTS variable). Unknown
 * keys and invalid values (negative, non-finite) are ignored: each falls back
 * to its default, so a typo never breaks recommendations.
 */
export function parseMatchingWeights(json: string | undefined): MatchingWeights {
  const weights = { ...DEFAULT_MATCHING_WEIGHTS };
  if (!json?.trim()) return weights;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return weights;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return weights;
  for (const key of Object.keys(weights) as (keyof MatchingWeights)[]) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) weights[key] = value;
  }
  return weights;
}

export interface MatchPlace extends LatLng {
  city: string;
  state: string;
}

/** One open load for one unit (a match_candidates row, in camelCase). */
export interface MatchCandidate {
  loadId: string;
  vehicleId: string;
  /** Where and when the unit is free. */
  start: MatchPlace;
  availableFrom: string;
  /** The unit is finishing a trip and starts at its destination. */
  isReturnTrip: boolean;
  origin: MatchPlace;
  destination: MatchPlace;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  proposedPriceCents: number;
  /** Straight line from the delivery to the carrier's base (return trips only). */
  homeDistanceKm: number | null;
  /** The carrier's usual route the load follows, if any. */
  matchedRoute: { originCity: string; destinationCity: string } | null;
}

/** Where a distance came from: Google Routes (now or cached) or haversine × road factor. */
export type DistanceSource = 'routes' | 'cache' | 'estimate';

export interface LegDistance {
  km: number;
  minutes: number;
  source: DistanceSource;
}

export interface CandidateDistances {
  /** From where the unit is free to the pickup. */
  empty: LegDistance;
  /** From the pickup to the delivery. */
  loaded: LegDistance;
}

export interface MatchBreakdown {
  emptyKm: number;
  loadedKm: number;
  idleHours: number;
  /** Proposed price per total km, in MXN cents. */
  pricePerKmCents: number;
  matchedRoute: MatchCandidate['matchedRoute'];
  isReturnTrip: boolean;
  returnHome: boolean;
  /** `estimate` if any leg is an estimate. */
  distanceSource: DistanceSource;
  /** Contribution of each ingredient to the score. */
  points: {
    pricePerKm: number;
    emptyKm: number;
    idleHours: number;
    routeMatch: number;
    returnHome: number;
  };
}

export interface ScoredMatch {
  candidate: MatchCandidate;
  score: number;
  breakdown: MatchBreakdown;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const HOUR_MS = 3_600_000;

function combinedSource(a: DistanceSource, b: DistanceSource): DistanceSource {
  if (a === 'estimate' || b === 'estimate') return 'estimate';
  return a === 'routes' || b === 'routes' ? 'routes' : 'cache';
}

/**
 * Scores one candidate. Returns null when the unit cannot reach the pickup
 * before the window closes (free time + empty driving time).
 */
export function scoreCandidate(
  candidate: MatchCandidate,
  distances: CandidateDistances,
  weights: MatchingWeights = DEFAULT_MATCHING_WEIGHTS,
  now: Date = new Date(),
): ScoredMatch | null {
  const freeAt = Math.max(Date.parse(candidate.availableFrom), now.getTime());
  const arrival = freeAt + distances.empty.minutes * 60_000;
  const pickupStart = Date.parse(candidate.pickupWindowStart);
  const pickupEnd = Date.parse(candidate.pickupWindowEnd);
  if (![freeAt, pickupStart, pickupEnd].every(Number.isFinite) || arrival > pickupEnd) return null;

  const idleHours = Math.max(0, pickupStart - arrival) / HOUR_MS;
  const totalKm = distances.empty.km + distances.loaded.km;
  const pricePerKmCents = totalKm > 0 ? Math.round(candidate.proposedPriceCents / totalKm) : 0;
  const returnHome =
    candidate.isReturnTrip &&
    candidate.homeDistanceKm !== null &&
    candidate.homeDistanceKm <= weights.returnHomeRadiusKm;

  const points = {
    pricePerKm: round2((weights.pricePerKm * pricePerKmCents) / 100),
    emptyKm: round2(-weights.emptyKm * distances.empty.km),
    idleHours: round2(-weights.idleHours * Math.min(idleHours, weights.maxIdleHours)),
    routeMatch: candidate.matchedRoute ? weights.routeMatch : 0,
    returnHome: returnHome ? weights.returnHome : 0,
  };
  const score = round2(Object.values(points).reduce((sum, p) => sum + p, 0));

  return {
    candidate,
    score,
    breakdown: {
      emptyKm: round2(distances.empty.km),
      loadedKm: round2(distances.loaded.km),
      idleHours: round2(idleHours),
      pricePerKmCents,
      matchedRoute: candidate.matchedRoute,
      isReturnTrip: candidate.isReturnTrip,
      returnHome,
      distanceSource: combinedSource(distances.empty.source, distances.loaded.source),
      points,
    },
  };
}

/** Best first: score, then fewer empty km, then load id (stable). */
export function rankMatches<T extends ScoredMatch>(matches: readonly T[]): T[] {
  return [...matches].sort(
    (a, b) =>
      b.score - a.score ||
      a.breakdown.emptyKm - b.breakdown.emptyKm ||
      a.candidate.loadId.localeCompare(b.candidate.loadId),
  );
}
