// Matching V1 (B08) with fixtures of the pilot corridor: Monterrey,
// Guadalajara, Saltillo and León (real coordinates, as in the demo seed).
import { describe, expect, it, vi } from 'vitest';
import { matchExplanation, shortCityName } from '../copy/matching';
import {
  candidateFromRow,
  createRoutesResolver,
  DEFAULT_MATCHING_WEIGHTS,
  estimateLeg,
  fetchRouteDistance,
  GOOGLE_ROUTES_URL,
  legKey,
  parseMatchingWeights,
  rankMatches,
  recommend,
  roundLeg,
  scoreCandidate,
  type CachedDistance,
  type DistanceCache,
  type Leg,
  type MatchCandidate,
  type MatchCandidateRow,
} from './index';

const NOW = new Date('2026-10-20T12:00:00Z');
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

const MTY = { city: 'Monterrey', state: 'Nuevo León', lat: 25.6866, lng: -100.3161 };
const APODACA = { city: 'Apodaca', state: 'Nuevo León', lat: 25.7817, lng: -100.1886 };
const GDL = { city: 'Guadalajara', state: 'Jalisco', lat: 20.6597, lng: -103.3496 };
const GDL_WAREHOUSE = { city: 'Guadalajara', state: 'Jalisco', lat: 20.656, lng: -103.391 };
const SALTILLO = { city: 'Saltillo', state: 'Coahuila', lat: 25.4383, lng: -100.9737 };
const LEON = { city: 'León', state: 'Guanajuato', lat: 21.048, lng: -101.57 };

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    loadId: 'load-gdl-mty',
    vehicleId: 'unit-1',
    start: GDL,
    availableFrom: at(2),
    isReturnTrip: false,
    origin: GDL_WAREHOUSE,
    destination: MTY,
    pickupWindowStart: at(4),
    pickupWindowEnd: at(30),
    proposedPriceCents: 3_900_000,
    homeDistanceKm: null,
    matchedRoute: null,
    ...overrides,
  };
}

/** Fails the test when a value that must exist is missing. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value');
  return value;
}

const estimates = (c: MatchCandidate) => ({
  empty: estimateLeg({ from: c.start, to: c.origin }),
  loaded: estimateLeg({ from: c.origin, to: c.destination }),
});

describe('scoreCandidate', () => {
  it('explains every ingredient of the score', () => {
    const c = candidate({
      isReturnTrip: true,
      homeDistanceKm: 14,
      matchedRoute: { originCity: 'Guadalajara', destinationCity: 'Monterrey' },
    });
    const match = scoreCandidate(c, estimates(c), DEFAULT_MATCHING_WEIGHTS, NOW);
    expect(match).not.toBeNull();
    const { breakdown, score } = must(match);
    expect(breakdown.emptyKm).toBeCloseTo(5.5, 0);
    expect(breakdown.loadedKm).toBeGreaterThan(800);
    expect(breakdown.idleHours).toBeCloseTo(1.9, 1);
    expect(breakdown.pricePerKmCents).toBe(
      Math.round(3_900_000 / (breakdown.emptyKm + breakdown.loadedKm)),
    );
    expect(breakdown.returnHome).toBe(true);
    expect(breakdown.distanceSource).toBe('estimate');
    expect(breakdown.points.routeMatch).toBe(15);
    expect(breakdown.points.returnHome).toBe(20);
    expect(breakdown.points.emptyKm).toBeLessThan(0);
    expect(breakdown.points.idleHours).toBeLessThan(0);
    const sum = Object.values(breakdown.points).reduce((a, b) => a + b, 0);
    expect(score).toBeCloseTo(sum, 1);
  });

  it('drops a unit that cannot reach the pickup before the window closes', () => {
    const c = candidate({ start: LEON, availableFrom: at(1), pickupWindowEnd: at(2) });
    expect(scoreCandidate(c, estimates(c), DEFAULT_MATCHING_WEIGHTS, NOW)).toBeNull();
    expect(
      scoreCandidate(candidate({ pickupWindowEnd: 'nope' }), estimates(candidate())),
    ).toBeNull();
  });

  it('counts idle time from now when the unit is already free, capped at maxIdleHours', () => {
    const c = candidate({
      start: GDL_WAREHOUSE,
      availableFrom: at(-10),
      pickupWindowStart: at(500),
      pickupWindowEnd: at(600),
    });
    const match = must(scoreCandidate(c, estimates(c), DEFAULT_MATCHING_WEIGHTS, NOW));
    expect(match.breakdown.idleHours).toBeCloseTo(500, 0);
    expect(match.breakdown.points.idleHours).toBe(-DEFAULT_MATCHING_WEIGHTS.idleHours * 96);
  });

  it('gives no return bonus outside return-trip mode or far from the base', () => {
    const far = candidate({ isReturnTrip: true, homeDistanceKm: 300 });
    expect(must(scoreCandidate(far, estimates(far), undefined, NOW)).breakdown.returnHome).toBe(
      false,
    );
    const notReturn = candidate({ homeDistanceKm: 5 });
    expect(
      must(scoreCandidate(notReturn, estimates(notReturn), undefined, NOW)).breakdown.returnHome,
    ).toBe(false);
  });

  it('handles zero distances and combines the distance sources', () => {
    const zero = { km: 0, minutes: 0, source: 'cache' as const };
    const match = must(scoreCandidate(candidate(), { empty: zero, loaded: zero }, undefined, NOW));
    expect(match.breakdown.pricePerKmCents).toBe(0);
    expect(match.breakdown.distanceSource).toBe('cache');
    const routes = { km: 10, minutes: 10, source: 'routes' as const };
    expect(
      must(scoreCandidate(candidate(), { empty: zero, loaded: routes }, undefined, NOW)).breakdown
        .distanceSource,
    ).toBe('routes');
  });
});

describe('ranking with corridor fixtures', () => {
  // The unit unloading in Guadalajara (return-trip mode, base in Monterrey).
  const returnUnit = { start: GDL, isReturnTrip: true };
  const loads = [
    candidate({
      ...returnUnit,
      loadId: 'gdl-mty',
      homeDistanceKm: 14,
      matchedRoute: { originCity: 'Guadalajara', destinationCity: 'Monterrey' },
    }),
    candidate({
      ...returnUnit,
      loadId: 'leon-apodaca',
      origin: LEON,
      destination: APODACA,
      proposedPriceCents: 3_200_000,
      homeDistanceKm: 15,
    }),
    candidate({
      ...returnUnit,
      loadId: 'gdl-saltillo',
      destination: SALTILLO,
      proposedPriceCents: 3_000_000,
      homeDistanceKm: 70,
    }),
  ];

  it('puts the GDL → MTY return trip first for the unit unloading in Guadalajara', async () => {
    const ranked = await recommend(loads, { now: NOW });
    expect(ranked.map((m) => m.candidate.loadId)[0]).toBe('gdl-mty');
    expect(
      must(ranked.find((m) => m.candidate.loadId === 'leon-apodaca')).breakdown.emptyKm,
    ).toBeGreaterThan(200);
  });

  it('prefers the nearer pickup for a unit free in Monterrey', async () => {
    const inMty = { start: MTY, isReturnTrip: false };
    const ranked = await recommend(
      [
        candidate({
          ...inMty,
          loadId: 'saltillo-gdl',
          origin: SALTILLO,
          destination: GDL,
          proposedPriceCents: 2_900_000,
        }),
        candidate({
          ...inMty,
          loadId: 'mty-gdl',
          origin: APODACA,
          destination: GDL,
          proposedPriceCents: 2_900_000,
        }),
      ],
      { now: NOW },
    );
    expect(ranked.map((m) => m.candidate.loadId)).toEqual(['mty-gdl', 'saltillo-gdl']);
  });

  it('breaks ties by empty km and then by load id', () => {
    const base = must(scoreCandidate(candidate(), estimates(candidate()), undefined, NOW));
    const tie = (loadId: string, emptyKm: number) => ({
      ...base,
      candidate: { ...base.candidate, loadId },
      breakdown: { ...base.breakdown, emptyKm },
    });
    expect(
      rankMatches([tie('b', 5), tie('a', 5), tie('c', 1)]).map((m) => m.candidate.loadId),
    ).toEqual(['c', 'a', 'b']);
  });

  it('weights are configurable', async () => {
    const weights = parseMatchingWeights(
      JSON.stringify({ routeMatch: 0, returnHome: 0, emptyKm: 0, pricePerKm: 10 }),
    );
    const ranked = await recommend(loads, { now: NOW, weights });
    expect(must(ranked[0]).breakdown.points.routeMatch).toBe(0);
    expect(must(ranked[0]).breakdown.points.pricePerKm).toBe(
      Math.round(must(ranked[0]).breakdown.pricePerKmCents * 10) / 100,
    );
  });
});

describe('parseMatchingWeights', () => {
  it('falls back to the defaults for missing, invalid or unknown values', () => {
    expect(parseMatchingWeights(undefined)).toEqual(DEFAULT_MATCHING_WEIGHTS);
    expect(parseMatchingWeights('not json')).toEqual(DEFAULT_MATCHING_WEIGHTS);
    expect(parseMatchingWeights('[1]')).toEqual(DEFAULT_MATCHING_WEIGHTS);
    expect(
      parseMatchingWeights('{"emptyKm": -1, "idleHours": "2", "foo": 3, "routeMatch": 30}'),
    ).toEqual({
      ...DEFAULT_MATCHING_WEIGHTS,
      routeMatch: 30,
    });
  });
});

describe('recommend: top N and road distances', () => {
  const many = Array.from({ length: 15 }, (_, i) =>
    candidate({
      loadId: `load-${String(i).padStart(2, '0')}`,
      proposedPriceCents: 3_000_000 + i * 10_000,
    }),
  );

  it('resolves road distances only for the top N and re-scores with them', async () => {
    const resolveDistances = vi.fn(async (legs: readonly Leg[]) => {
      expect(legs).toHaveLength(6);
      return new Map(
        legs.map((leg) => [legKey(leg), { km: 900, minutes: 600, source: 'routes' as const }]),
      );
    });
    const ranked = await recommend(many, { now: NOW, topN: 3, resolveDistances });
    expect(resolveDistances).toHaveBeenCalledOnce();
    expect(ranked.map((m) => m.candidate.loadId)).toEqual(['load-14', 'load-13', 'load-12']);
    expect(
      ranked.every((m) => m.breakdown.distanceSource === 'routes' && m.breakdown.loadedKm === 900),
    ).toBe(true);
  });

  it('keeps the estimate for the legs it could not resolve, and clamps N', async () => {
    const ranked = await recommend(many, {
      now: NOW,
      topN: 99,
      resolveDistances: async () => new Map(),
    });
    expect(ranked).toHaveLength(15);
    expect(ranked.every((m) => m.breakdown.distanceSource === 'estimate')).toBe(true);
    expect(await recommend([], { resolveDistances: vi.fn() })).toEqual([]);
    expect(await recommend(many, { now: NOW, topN: 0 })).toHaveLength(1);
  });
});

describe('Google Routes through the cache', () => {
  const leg: Leg = { from: GDL, to: GDL_WAREHOUSE };
  const routesResponse = (meters: number, duration: string) =>
    new Response(JSON.stringify({ routes: [{ distanceMeters: meters, duration }] }), {
      status: 200,
    });

  function memoryCache(entries: CachedDistance[] = []): DistanceCache & { puts: CachedDistance[] } {
    const puts: CachedDistance[] = [];
    return {
      puts,
      get: async (legs) => entries.filter((e) => legs.some((l) => legKey(l) === legKey(e.leg))),
      put: async (more) => {
        puts.push(...more);
      },
    };
  }

  it('rounds legs to the cache precision', () => {
    expect(roundLeg(leg)).toEqual({
      from: { lat: 20.66, lng: -103.35 },
      to: { lat: 20.66, lng: -103.39 },
    });
    expect(legKey(leg)).toBe('20.66,-103.35>20.66,-103.39');
  });

  it('parses a Routes response and sends the key only in the header', async () => {
    const fetch = vi.fn(async () => routesResponse(6200, '540s'));
    expect(await fetchRouteDistance(leg, { apiKey: 'test-key', fetch })).toEqual({
      km: 6.2,
      minutes: 9,
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GOOGLE_ROUTES_URL);
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('test-key');
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(
      'routes.distanceMeters,routes.duration',
    );
    expect(String(init.body)).not.toContain('test-key');
  });

  it('returns null when Routes fails or has no route', async () => {
    const options = (response: Response) => ({ apiKey: 'k', fetch: async () => response });
    expect(await fetchRouteDistance(leg, options(new Response('', { status: 403 })))).toBeNull();
    expect(await fetchRouteDistance(leg, options(new Response('{}', { status: 200 })))).toBeNull();
    expect(await fetchRouteDistance(leg, options(routesResponse(10, 'soon')))).toBeNull();
  });

  it('uses the cache first, calls Routes for the misses (bounded) and stores them', async () => {
    const other: Leg = { from: GDL_WAREHOUSE, to: MTY };
    const third: Leg = { from: SALTILLO, to: GDL };
    const cache = memoryCache([{ leg: roundLeg(leg), km: 5, minutes: 8 }]);
    const fetch = vi.fn(async () => routesResponse(820_000, '36000s'));
    const resolve = createRoutesResolver({ apiKey: 'k', cache, fetch, maxRequests: 1 });
    const result = await resolve([leg, leg, other, third]);
    expect(result.get(legKey(leg))).toEqual({ km: 5, minutes: 8, source: 'cache' });
    expect(result.get(legKey(other))).toEqual({ km: 820, minutes: 600, source: 'routes' });
    expect(result.has(legKey(third))).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
    expect(cache.puts).toEqual([{ leg: roundLeg(other), km: 820, minutes: 600 }]);
  });

  it('never calls Routes without an API key or when the cache fails', async () => {
    const fetch = vi.fn();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(
      (
        await createRoutesResolver({
          apiKey: undefined,
          cache: memoryCache(),
          fetch,
          maxRequests: 5,
        })([leg])
      ).size,
    ).toBe(0);
    const broken: DistanceCache = { get: () => Promise.reject(new Error('down')), put: vi.fn() };
    expect(
      (await createRoutesResolver({ apiKey: 'k', cache: broken, fetch, maxRequests: 5 })([leg]))
        .size,
    ).toBe(0);
    expect(
      await createRoutesResolver({ apiKey: 'k', cache: broken, fetch, maxRequests: 5 })([]),
    ).toEqual(new Map());
    expect(fetch).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('survives Routes and cache write errors', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = createRoutesResolver({
      apiKey: 'k',
      cache: memoryCache(),
      fetch: () => Promise.reject(new Error('timeout')),
      maxRequests: 5,
    });
    expect((await failing([leg])).size).toBe(0);
    const readOnly: DistanceCache = {
      get: async () => [],
      put: () => Promise.reject(new Error('denied')),
    };
    const resolve = createRoutesResolver({
      apiKey: 'k',
      cache: readOnly,
      fetch: async () => routesResponse(1000, '60s'),
      maxRequests: 5,
    });
    expect((await resolve([leg])).get(legKey(leg))?.source).toBe('routes');
    expect(errors).toHaveBeenCalledTimes(2);
    errors.mockRestore();
  });
});

describe('candidateFromRow', () => {
  const row: MatchCandidateRow = {
    load_id: 'l1',
    company_id: 'c1',
    vehicle_id: 'v1',
    availability_id: null,
    start_city: 'Guadalajara',
    start_state: 'Jalisco',
    start_lat: GDL.lat,
    start_lng: GDL.lng,
    available_from: at(2),
    is_return_trip: true,
    origin_city: 'Guadalajara',
    origin_state: 'Jalisco',
    origin_lat: GDL_WAREHOUSE.lat,
    origin_lng: GDL_WAREHOUSE.lng,
    destination_city: 'Monterrey',
    destination_state: 'Nuevo León',
    destination_lat: MTY.lat,
    destination_lng: MTY.lng,
    pickup_window_start: at(4),
    pickup_window_end: at(30),
    unit_type: 'dry_van',
    weight_kg: 18000,
    proposed_price_cents: 3_900_000,
    empty_km: 4.8,
    home_distance_km: 14.1,
    route_origin_city: 'Guadalajara',
    route_destination_city: 'Monterrey',
  };

  it('maps a match_candidates row', () => {
    const c = candidateFromRow(row);
    expect(c).toMatchObject({
      loadId: 'l1',
      vehicleId: 'v1',
      isReturnTrip: true,
      start: { city: 'Guadalajara', lat: GDL.lat },
      destination: { city: 'Monterrey', state: 'Nuevo León' },
      homeDistanceKm: 14.1,
      matchedRoute: { originCity: 'Guadalajara', destinationCity: 'Monterrey' },
    });
    expect(
      candidateFromRow({
        ...row,
        route_origin_city: null,
        home_distance_km: null,
        is_return_trip: null,
      }),
    ).toMatchObject({
      matchedRoute: null,
      homeDistanceKm: null,
      isReturnTrip: false,
    });
  });

  it('rejects incomplete rows', () => {
    expect(() => candidateFromRow({ ...row, origin_lat: null })).toThrow('origin_lat');
  });
});

describe('matchExplanation (copy)', () => {
  it('reads like the plan example', () => {
    const c = candidate({
      matchedRoute: { originCity: 'Monterrey', destinationCity: 'Guadalajara' },
    });
    const breakdown = {
      ...must(scoreCandidate(c, estimates(c), undefined, NOW)).breakdown,
      emptyKm: 45,
      pricePerKmCents: 3800,
      idleHours: 0.5,
    };
    expect(matchExplanation(breakdown)).toBe(
      '45 km en vacío · $38/km · recolección inmediata · coincide con tu ruta MTY–GDL',
    );
    expect(
      matchExplanation({
        ...breakdown,
        emptyKm: 0.2,
        idleHours: 5.4,
        matchedRoute: null,
        returnHome: true,
      }),
    ).toBe('Sin km en vacío · $38/km · 5 h de espera · te acerca a tu base');
  });

  it('abbreviates the corridor cities only', () => {
    expect(shortCityName(' Guadalajara ')).toBe('GDL');
    expect(shortCityName('León')).toBe('León');
  });
});
