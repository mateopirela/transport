import { describe, expect, it } from 'vitest';

import {
  buildCarrierFeed,
  carrierNegotiationState,
  carrierOfferErrorText,
  directionsUrl,
  offerStatusReasonText,
  FEED_RECOMMENDATIONS,
  RETURN_TRIPS_PER_UNIT,
  sortOffers,
  toRecommendation,
  type NegotiationOffer,
  type Recommendation,
} from './carrier-loads';
import { carrierLoadsCopy } from './copy/carrier-loads';
import { matchExplanation } from './copy/matching';
import { offersCopy } from './copy/negotiation';
import { recommend, type MatchCandidate } from './matching';

const NOW = new Date('2026-10-20T12:00:00Z');
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

const MTY = { city: 'Monterrey', state: 'Nuevo León', lat: 25.6866, lng: -100.3161 };
const APODACA = { city: 'Apodaca', state: 'Nuevo León', lat: 25.7817, lng: -100.1886 };
const GDL = { city: 'Guadalajara', state: 'Jalisco', lat: 20.6597, lng: -103.3496 };
const GDL_WAREHOUSE = { city: 'Guadalajara', state: 'Jalisco', lat: 20.656, lng: -103.391 };
const SALTILLO = { city: 'Saltillo', state: 'Coahuila', lat: 25.4383, lng: -100.9737 };

function candidate(overrides: Partial<MatchCandidate>): MatchCandidate {
  return {
    loadId: 'load',
    vehicleId: 'unit',
    start: MTY,
    availableFrom: at(1),
    isReturnTrip: false,
    origin: APODACA,
    destination: GDL,
    pickupWindowStart: at(6),
    pickupWindowEnd: at(30),
    proposedPriceCents: 3_800_000,
    homeDistanceKm: null,
    matchedRoute: null,
    ...overrides,
  };
}

async function unitRecommendations(vehicleId: string, candidates: MatchCandidate[]) {
  const scored = await recommend(candidates, { now: NOW });
  return {
    vehicleId,
    recommendations: scored.map((m) => toRecommendation(m, matchExplanation(m.breakdown))),
  };
}

describe('buildCarrierFeed', () => {
  it('puts the GDL -> MTY return load of the unit unloading in Guadalajara on top (seed scenario)', async () => {
    // Transportes Regios del Norte: CS53-01 unloads in GDL in 2 h (return-trip
    // mode); another dry van is free in Monterrey.
    const unloading = await unitRecommendations('cs53-01', [
      candidate({
        loadId: 'gdl-mty',
        vehicleId: 'cs53-01',
        start: GDL,
        availableFrom: at(2),
        isReturnTrip: true,
        origin: GDL_WAREHOUSE,
        destination: APODACA,
        pickupWindowStart: at(4),
        proposedPriceCents: 3_900_000,
        homeDistanceKm: 14,
        matchedRoute: { originCity: 'Guadalajara', destinationCity: 'Monterrey' },
      }),
    ]);
    const inMonterrey = await unitRecommendations('cs53-02', [
      candidate({ loadId: 'mty-gdl', vehicleId: 'cs53-02', proposedPriceCents: 5_500_000 }),
      candidate({ loadId: 'saltillo-gdl', vehicleId: 'cs53-02', origin: SALTILLO }),
    ]);

    const feed = buildCarrierFeed([inMonterrey, unloading], new Map([['cs53-01', 'Guadalajara']]));

    expect(feed.returnTrips).toHaveLength(1);
    const [group] = feed.returnTrips;
    expect(group?.vehicleId).toBe('cs53-01');
    expect(group?.startCity).toBe('Guadalajara');
    expect(group?.recommendations.map((r) => r.loadId)).toEqual(['gdl-mty']);
    expect(group?.recommendations[0]?.explanation).toContain('coincide con tu ruta GDL–MTY');
    expect(feed.recommended.map((r) => r.loadId)).toEqual(['mty-gdl', 'saltillo-gdl']);
  });

  const rec = (loadId: string, vehicleId: string, score: number, isReturnTrip = false) =>
    ({
      loadId,
      vehicleId,
      score,
      breakdown: { emptyKm: 10, isReturnTrip },
    }) as unknown as Recommendation;

  it('keeps the best unit per load and does not repeat return loads', () => {
    const feed = buildCarrierFeed([
      { vehicleId: 'a', recommendations: [rec('l1', 'a', 10), rec('l2', 'a', 50, true)] },
      { vehicleId: 'b', recommendations: [rec('l1', 'b', 30), rec('l2', 'b', 40)] },
    ]);
    expect(feed.returnTrips.map((g) => g.vehicleId)).toEqual(['a']);
    expect(feed.recommended).toEqual([rec('l1', 'b', 30)]);
  });

  it('orders return groups by their best load and caps the lists', () => {
    const many = (vehicleId: string, base: number, isReturnTrip: boolean) => ({
      vehicleId,
      recommendations: Array.from({ length: 15 }, (_, i) =>
        rec(`${vehicleId}-${i}`, vehicleId, base - i, isReturnTrip),
      ),
    });
    const feed = buildCarrierFeed([
      many('low', 10, true),
      many('high', 90, true),
      many('free', 50, false),
    ]);
    expect(feed.returnTrips.map((g) => g.vehicleId)).toEqual(['high', 'low']);
    expect(feed.returnTrips[0]?.recommendations).toHaveLength(RETURN_TRIPS_PER_UNIT);
    expect(feed.recommended).toHaveLength(FEED_RECOMMENDATIONS);
    // Return loads beyond the first ones of each unit stay in the general list.
    expect(feed.recommended[0]?.loadId).toBe('high-3');
  });

  it('is empty without recommendations', () => {
    expect(buildCarrierFeed([{ vehicleId: 'a', recommendations: [] }])).toEqual({
      returnTrips: [],
      recommended: [],
    });
  });
});

describe('carrierNegotiationState', () => {
  const offer = (overrides: Partial<NegotiationOffer>): NegotiationOffer => ({
    id: 'o1',
    side: 'carrier',
    amount_cents: 3_500_000,
    conditions: null,
    vehicle_id: null,
    status: 'pending',
    status_reason: null,
    created_at: '2026-10-20T12:00:00Z',
    ...overrides,
  });

  it('follows the offer chain', () => {
    expect(carrierNegotiationState([], 'published')).toBe('open');
    expect(carrierNegotiationState([offer({})], 'negotiating')).toBe('awaiting_shipper');
    const countered = [
      offer({ status: 'countered' }),
      offer({ id: 'o2', side: 'shipper', created_at: '2026-10-20T13:00:00Z' }),
    ];
    expect(carrierNegotiationState(countered, 'negotiating')).toBe('respond');
    expect(carrierNegotiationState([offer({ status: 'withdrawn' })], 'published')).toBe('reopen');
  });

  it('knows when the carrier won, lost or the load closed', () => {
    expect(carrierNegotiationState([offer({ status: 'accepted' })], 'contracted')).toBe('won');
    expect(
      carrierNegotiationState(
        [offer({ status: 'rejected', status_reason: 'other_offer_accepted' })],
        'contracted',
      ),
    ).toBe('lost');
    expect(carrierNegotiationState([], 'cancelled')).toBe('closed');
    expect(carrierNegotiationState([offer({})], 'expired')).toBe('closed');
  });

  it('sorts offers by creation, then id', () => {
    const offers = [
      offer({ id: 'b', created_at: '2026-10-20T12:00:00Z' }),
      offer({ id: 'c', created_at: '2026-10-20T11:00:00Z' }),
      offer({ id: 'a', created_at: '2026-10-20T12:00:00Z' }),
    ];
    expect(sortOffers(offers).map((o) => o.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('carrierOfferErrorText', () => {
  it('maps the fixed messages of the negotiation RPCs to Spanish copy', () => {
    const e = carrierLoadsCopy.errors;
    const cases: [string, string][] = [
      ['company is not approved', e.notApproved],
      ['only carriers can make offers', e.notApproved],
      ['load not found', e.loadGone],
      ['offer not found', e.loadGone],
      ['cannot offer on a load in status contracted', e.loadClosed],
      ['load is no longer open (status cancelled)', e.loadClosed],
      ['pickup window already ended', e.pickupEnded],
      ['negotiation already has a pending offer', e.pending],
      ['offer is no longer pending (status countered)', e.notPending],
      ['offer cannot be answered by this side', e.notPending],
      ['invalid offer: amount must be positive', e.invalidAmount],
      ['invalid offer: conditions too long', e.invalidAmount],
      ['invalid offer: vehicle not found', e.invalidUnit],
      ['business unit not found', e.invalidUnit],
      ['another business unit of the company already negotiates this load', e.otherBusinessUnit],
      ['business_unit_id is required', e.businessUnitRequired],
      ['both companies must be approved', e.bothApproved],
    ];
    for (const [message, text] of cases) expect(carrierOfferErrorText(message)).toBe(text);
  });

  it('returns null for anything else, so database text never reaches the user', () => {
    expect(carrierOfferErrorText('')).toBeNull();
    expect(carrierOfferErrorText('duplicate key value violates unique constraint')).toBeNull();
    // Only the start of the message counts.
    expect(carrierOfferErrorText('context: load not found')).toBeNull();
  });
});

describe('offerStatusReasonText', () => {
  it('translates the fixed reasons and keeps the ones a person typed', () => {
    expect(offerStatusReasonText('other_offer_accepted')).toBe(
      offersCopy.statusReasons.other_offer_accepted,
    );
    expect(offerStatusReasonText('load_cancelled')).toBe(offersCopy.statusReasons.load_cancelled);
    expect(offerStatusReasonText('load_expired')).toBe(offersCopy.statusReasons.load_expired);
    expect(offerStatusReasonText('Muy caro para la ruta')).toBe('Muy caro para la ruta');
    expect(offerStatusReasonText(null)).toBeNull();
    expect(offerStatusReasonText('')).toBeNull();
    // Object prototype keys are not reasons.
    expect(offerStatusReasonText('constructor')).toBe('constructor');
  });
});

describe('directionsUrl', () => {
  it('goes from the unit through the pickup to the delivery', () => {
    const url = new URL(directionsUrl(GDL_WAREHOUSE, APODACA, GDL));
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('origin')).toBe('20.65970,-103.34960');
    expect(url.searchParams.get('waypoints')).toBe('20.65600,-103.39100');
    expect(url.searchParams.get('destination')).toBe('25.78170,-100.18860');
    expect(url.searchParams.get('travelmode')).toBe('driving');
  });

  it('starts at the pickup without a unit', () => {
    const url = new URL(directionsUrl(GDL_WAREHOUSE, APODACA));
    expect(url.searchParams.get('origin')).toBe('20.65600,-103.39100');
    expect(url.searchParams.has('waypoints')).toBe(false);
  });
});
