// Carrier side of loads and negotiation (B19): the home feed built from the
// recommendations of each unit, the state of a negotiation for the carrier and
// the link that opens a route in the phone's maps app. Pure, so the ordering
// and the allowed actions are unit-tested; Postgres validates every action
// again in the negotiation RPCs (B05).
import type { LoadStatus, OfferSide, OfferStatus } from './enums';
import type { LatLng } from './geo';
import type { MatchBreakdown, MatchPlace, ScoredMatch } from './matching/scoring';

/** One recommendation, as the Edge Function `recommendations` returns it (B08). */
export interface Recommendation {
  loadId: string;
  vehicleId: string;
  origin: MatchPlace;
  destination: MatchPlace;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  proposedPriceCents: number;
  score: number;
  explanation: string;
  breakdown: MatchBreakdown;
}

/** The same shape from a locally scored match (fallback without the Edge Function). */
export function toRecommendation(
  { candidate, score, breakdown }: ScoredMatch,
  explanation: string,
): Recommendation {
  return {
    loadId: candidate.loadId,
    vehicleId: candidate.vehicleId,
    origin: candidate.origin,
    destination: candidate.destination,
    pickupWindowStart: candidate.pickupWindowStart,
    pickupWindowEnd: candidate.pickupWindowEnd,
    proposedPriceCents: candidate.proposedPriceCents,
    score,
    explanation,
    breakdown,
  };
}

export interface UnitRecommendations {
  vehicleId: string;
  recommendations: readonly Recommendation[];
}

export interface ReturnTripGroup {
  vehicleId: string;
  /** Where the unit finishes its current trip. */
  startCity: string | null;
  recommendations: Recommendation[];
}

export interface CarrierFeed {
  /** Units finishing a trip, with their best return loads; best group first. */
  returnTrips: ReturnTripGroup[];
  /** Other recommendations: the best unit for each load, best first. */
  recommended: Recommendation[];
}

/** Return loads shown per unit, and recommendations shown in the general list. */
export const RETURN_TRIPS_PER_UNIT = 3;
export const FEED_RECOMMENDATIONS = 10;

const byScore = (a: Recommendation, b: Recommendation) =>
  b.score - a.score ||
  a.breakdown.emptyKm - b.breakdown.emptyKm ||
  a.loadId.localeCompare(b.loadId) ||
  a.vehicleId.localeCompare(b.vehicleId);

/**
 * Home feed of the carrier from the recommendations of each of its units.
 * Return-trip recommendations (unit with a trip in progress) go to their own
 * section, grouped by unit and ahead of everything else: that is the promise of
 * the V1. A load shown there is not repeated in the general list, which keeps
 * the best unit for each load.
 */
export function buildCarrierFeed(
  units: readonly UnitRecommendations[],
  startCities: ReadonlyMap<string, string> = new Map(),
): CarrierFeed {
  const groups: { best: Recommendation; group: ReturnTripGroup }[] = [];
  for (const unit of units) {
    const returns = unit.recommendations
      .filter((r) => r.breakdown.isReturnTrip)
      .sort(byScore)
      .slice(0, RETURN_TRIPS_PER_UNIT);
    const [best] = returns;
    if (!best) continue;
    groups.push({
      best,
      group: {
        vehicleId: unit.vehicleId,
        startCity: startCities.get(unit.vehicleId) ?? null,
        recommendations: returns,
      },
    });
  }
  const returnTrips = groups
    .sort((a, b) => byScore(a.best, b.best) || a.group.vehicleId.localeCompare(b.group.vehicleId))
    .map(({ group }) => group);
  const shown = new Set<string>();
  for (const group of returnTrips) for (const r of group.recommendations) shown.add(r.loadId);

  const bestPerLoad = new Map<string, Recommendation>();
  for (const r of units.flatMap((u) => u.recommendations)) {
    if (shown.has(r.loadId)) continue;
    const best = bestPerLoad.get(r.loadId);
    if (!best || byScore(r, best) < 0) bestPerLoad.set(r.loadId, r);
  }
  const recommended = [...bestPerLoad.values()].sort(byScore).slice(0, FEED_RECOMMENDATIONS);
  return { returnTrips, recommended };
}

/** An offer of the carrier's negotiation on a load (offers, RLS). */
export interface NegotiationOffer {
  id: string;
  side: OfferSide;
  amount_cents: number;
  conditions: string | null;
  vehicle_id: string | null;
  status: OfferStatus;
  status_reason: string | null;
  created_at: string;
}

/**
 * What the carrier can do on a load:
 * - `open`: no offer yet (offer the proposed price or negotiate);
 * - `respond`: the shipper's counteroffer is pending (accept, counter, reject);
 * - `awaiting_shipper`: the carrier's offer is pending (withdraw);
 * - `reopen`: nothing pending and the load is open (offer again);
 * - `won`: the load was contracted with this carrier;
 * - `lost`: the shipper accepted another carrier's offer;
 * - `closed`: the load no longer takes offers.
 */
export type CarrierNegotiationState =
  'open' | 'respond' | 'awaiting_shipper' | 'reopen' | 'won' | 'lost' | 'closed';

const OPEN_LOAD: readonly LoadStatus[] = ['published', 'negotiating'];

const byCreation = (a: NegotiationOffer, b: NegotiationOffer) =>
  a.created_at === b.created_at
    ? a.id.localeCompare(b.id)
    : Date.parse(a.created_at) - Date.parse(b.created_at);

/** The offers of a negotiation in the order they were made. */
export function sortOffers(offers: readonly NegotiationOffer[]): NegotiationOffer[] {
  return [...offers].sort(byCreation);
}

export function carrierNegotiationState(
  offers: readonly NegotiationOffer[],
  loadStatus: LoadStatus,
): CarrierNegotiationState {
  if (offers.some((o) => o.status === 'accepted')) return 'won';
  const latest = sortOffers(offers).at(-1);
  if (latest?.status === 'rejected' && latest.status_reason === 'other_offer_accepted')
    return 'lost';
  if (!OPEN_LOAD.includes(loadStatus)) return 'closed';
  if (!latest) return 'open';
  if (latest.status !== 'pending') return 'reopen';
  // Only the counterparty answers an offer (accept_offer, counter_offer, reject_offer).
  return latest.side === 'shipper' ? 'respond' : 'awaiting_shipper';
}

/**
 * Directions in the phone's maps app (Google Maps URLs work on iOS and
 * Android and need no API key): from where the unit is free, through the
 * pickup, to the delivery.
 */
export function directionsUrl(pickup: LatLng, delivery: LatLng, start?: LatLng | null): string {
  const point = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  const params = new URLSearchParams({ api: '1', travelmode: 'driving' });
  if (start) {
    params.set('origin', point(start));
    params.set('waypoints', point(pickup));
  } else {
    params.set('origin', point(pickup));
  }
  params.set('destination', point(delivery));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
