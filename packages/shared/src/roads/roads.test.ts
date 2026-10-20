// Road intelligence (H4): catalog parsing, the suggested route and its effect
// on the matching score. Fixtures follow the pilot corridor MTY ↔ GDL.
import { describe, expect, it } from 'vitest';

import { matchExplanation } from '../copy/matching';
import {
  cardRoad,
  hourBandLabel,
  riskWarningText,
  roadsCopy,
  tollClassLabels,
  tollsText,
} from '../copy/roads';
import {
  DEFAULT_MATCHING_WEIGHTS,
  estimateLeg,
  recommend,
  scoreCandidate,
  type MatchCandidate,
} from '../matching';
import {
  createRoadSuggester,
  crossesBand,
  defaultAxleCount,
  inHourBand,
  mexicoCityHour,
  parseRoadCatalog,
  preferencesForLoad,
  segmentsForRoute,
  suggestLoadRoad,
  suggestRoute,
  tollClassFor,
  vehicleAxles,
  type RoadCorridor,
  type RoadRisk,
  type RoadSegment,
  type SuggestedRoute,
} from './index';

const MTY = { city: 'Monterrey', state: 'Nuevo León', lat: 25.6866, lng: -100.3161 };
const APODACA = { city: 'Apodaca', state: 'Nuevo León', lat: 25.7817, lng: -100.1886 };
const SAL = { city: 'Saltillo', state: 'Coahuila', lat: 25.4383, lng: -100.9737 };
const SLP = { city: 'San Luis Potosí', state: 'San Luis Potosí', lat: 22.1565, lng: -100.9855 };
const ZAC = { city: 'Zacatecas', state: 'Zacatecas', lat: 22.7709, lng: -102.5832 };
const GDL = { city: 'Guadalajara', state: 'Jalisco', lat: 20.6597, lng: -103.3496 };
const TLAQ = { city: 'Tlaquepaque', state: 'Jalisco', lat: 20.6409, lng: -103.2933 };
const CDMX = { city: 'Ciudad de México', state: 'Ciudad de México', lat: 19.4326, lng: -99.1332 };

function seg(
  id: string,
  from: typeof MTY,
  to: typeof MTY,
  distanceKm: number,
  extra: Partial<RoadSegment> = {},
): RoadSegment {
  return {
    id,
    code: id.toUpperCase(),
    name: `${from.city} – ${to.city}`,
    highway: null,
    from,
    to,
    distanceKm,
    isToll: false,
    source: 'Estimado',
    sourceUrl: null,
    sourceDate: '2026-10-20',
    dataStatus: 'estimated',
    tolls: [],
    risks: [],
    ...extra,
  };
}

const toll = (amountCents: number | null) => ({
  vehicleClass: 'c5' as const,
  amountCents,
  source: 'CAPUFE',
  sourceUrl: 'https://example.test/tarifas.pdf',
  validFrom: '2026-04-13',
  dataStatus: 'estimated' as const,
});

const risk = (level: RoadRisk['level'], fromHour: number, toHour: number): RoadRisk => ({
  id: `risk-${level}-${fromHour}`,
  level,
  fromHour,
  toHour,
  description: 'robo a transporte de carga',
  source: 'Fuente pública',
  sourceUrl: null,
  observedOn: '2026-09-30',
  dataStatus: 'estimated',
});

const area = (p: typeof MTY) => ({ ...p, radiusKm: 60 });

function corridors(
  overrides: { main?: Partial<RoadSegment>[]; alt?: Partial<RoadSegment>[] } = {},
): RoadCorridor[] {
  const main = [
    seg('mty-sal', MTY, SAL, 93, overrides.main?.[0]),
    seg('sal-slp', SAL, SLP, 480, { isToll: true, tolls: [toll(30_600)], ...overrides.main?.[1] }),
    seg('slp-gdl', SLP, GDL, 400, { isToll: true, tolls: [toll(44_200)], ...overrides.main?.[2] }),
  ];
  const alt = [
    seg('mty-sal', MTY, SAL, 93, overrides.alt?.[0]),
    seg('sal-zac', SAL, ZAC, 440, overrides.alt?.[1]),
    seg('zac-gdl', ZAC, GDL, 450, { isToll: true, tolls: [toll(90_000)], ...overrides.alt?.[2] }),
  ];
  return [
    {
      id: 'c-main',
      code: 'MTY-GDL-SLP',
      name: 'MTY–GDL por San Luis Potosí',
      bidirectional: true,
      origin: area(MTY),
      destination: area(GDL),
      segments: main,
    },
    {
      id: 'c-alt',
      code: 'MTY-GDL-ZAC',
      name: 'MTY–GDL por Zacatecas',
      bidirectional: true,
      origin: area(MTY),
      destination: area(GDL),
      segments: alt,
    },
  ];
}

/** 8:00 in Mexico City (UTC−6). */
const MORNING = '2026-10-21T14:00:00Z';
/** 20:00 in Mexico City. */
const EVENING = '2026-10-22T02:00:00Z';

function route(input: Partial<Parameters<typeof suggestRoute>[0]> = {}): SuggestedRoute {
  const result = suggestRoute({
    origin: APODACA,
    destination: TLAQ,
    departAt: MORNING,
    axleCount: 5,
    corridors: corridors(),
    ...input,
  });
  if (result.source !== 'catalog') throw new Error('expected a route');
  return result;
}

describe('axles and toll classes', () => {
  it('defaults the axles of each kind and body', () => {
    expect(defaultAxleCount('tractor', null)).toBe(5);
    expect(defaultAxleCount('trailer', 'dry_van')).toBe(5);
    expect(defaultAxleCount('rigid', 'torton')).toBe(3);
    expect(defaultAxleCount('rigid', 'rabon')).toBe(2);
    expect(defaultAxleCount('rigid', 'pickup_3_5t')).toBe(2);
    expect(defaultAxleCount('rigid', 'stake_bed')).toBe(3);
    expect(vehicleAxles({ kind: 'trailer', unit_type: 'dry_van', axle_count: 9 })).toBe(9);
    expect(vehicleAxles({ kind: 'rigid', unit_type: 'torton', axle_count: null })).toBe(3);
  });

  it('maps axles to C2 … C9, clamping out-of-range values', () => {
    expect(tollClassFor(5)).toBe('c5');
    expect(tollClassFor(1)).toBe('c2');
    expect(tollClassFor(12)).toBe('c9');
    expect(tollClassFor(Number.NaN)).toBe('c5');
    expect(tollClassLabels.c5).toBe('C5 · 5 ejes');
  });
});

describe('hour bands', () => {
  it('reads the hour in Mexico City', () => {
    expect(mexicoCityHour(new Date(MORNING))).toBe(8);
    expect(mexicoCityHour(new Date('2026-10-21T04:30:00Z'))).toBe(22.5);
  });

  it('handles bands that cross midnight and the whole day', () => {
    expect(inHourBand(23, 22, 6)).toBe(true);
    expect(inHourBand(3, 22, 6)).toBe(true);
    expect(inHourBand(12, 22, 6)).toBe(false);
    expect(inHourBand(10, 9, 17)).toBe(true);
    expect(inHourBand(17, 9, 17)).toBe(false);
    expect(inHourBand(0, 0, 24)).toBe(true);
    expect(inHourBand(23.9, 0, 24)).toBe(true);
  });

  it('detects a crossing that touches the band at any hour', () => {
    // 20:00 → 23:00 touches 22–6.
    expect(crossesBand(new Date(EVENING), new Date('2026-10-22T05:00:00Z'), 22, 6)).toBe(true);
    // 8:00 → 12:00 does not.
    expect(crossesBand(new Date(MORNING), new Date('2026-10-21T18:00:00Z'), 22, 6)).toBe(false);
    // A day-long crossing touches every band.
    expect(crossesBand(new Date(MORNING), new Date('2026-10-23T14:00:00Z'), 3, 4)).toBe(true);
  });

  it('labels bands', () => {
    expect(hourBandLabel(0, 24)).toBe('todo el día');
    expect(hourBandLabel(22, 6)).toBe('de noche');
    expect(hourBandLabel(10, 16)).toBe('de 10:00 a 16:00');
    expect(hourBandLabel(15, 3)).toBe('de 15:00 a 3:00');
  });
});

describe('suggestRoute', () => {
  it('picks the cheaper corridor whose areas contain the load, with tolls and crossing times', () => {
    const r = route();
    expect(r.corridor.code).toBe('MTY-GDL-SLP');
    expect(r.reversed).toBe(false);
    expect(r.tollClass).toBe('c5');
    expect(r.tollsCents).toBe(74_800);
    expect(r.tollsMissing).toBe(false);
    expect(r.distanceKm).toBe(973);
    expect(r.tollSources).toEqual([
      {
        source: 'CAPUFE',
        sourceUrl: 'https://example.test/tarifas.pdf',
        validFrom: '2026-04-13',
        dataStatus: 'estimated',
      },
    ]);
    // 93 km at 60 km/h after leaving at 8:00.
    expect(r.segments[1]?.enterAt).toBe('2026-10-21T15:33:00.000Z');
    expect(r.segments.map((s) => s.tollCents)).toEqual([0, 30_600, 44_200]);
  });

  it('runs a bidirectional corridor backwards', () => {
    const r = route({ origin: TLAQ, destination: APODACA });
    expect(r.reversed).toBe(true);
    expect(r.segments[0]?.fromCity).toBe('Guadalajara');
    expect(r.segments[0]?.name).toBe('Guadalajara – San Luis Potosí');
    expect(r.segments.at(-1)?.toCity).toBe('Monterrey');
  });

  it('ignores one-way corridors the other way, and loads outside every area', () => {
    const oneWay = corridors().map((c) => ({ ...c, bidirectional: false }));
    expect(
      suggestRoute({
        origin: GDL,
        destination: MTY,
        departAt: MORNING,
        axleCount: 5,
        corridors: oneWay,
      }),
    ).toEqual({
      source: 'none',
    });
    expect(
      suggestRoute({
        origin: MTY,
        destination: CDMX,
        departAt: MORNING,
        axleCount: 5,
        corridors: corridors(),
      }),
    ).toEqual({ source: 'none' });
    expect(
      suggestRoute({
        origin: MTY,
        destination: GDL,
        departAt: MORNING,
        axleCount: 5,
        corridors: [],
      }),
    ).toEqual({
      source: 'none',
    });
    expect(
      suggestRoute({
        origin: MTY,
        destination: GDL,
        departAt: 'not a date',
        axleCount: 5,
        corridors: corridors(),
      }),
    ).toEqual({ source: 'none' });
  });

  it('drops corridors with an avoided segment, and marks the best when all use one', () => {
    const avoidMain = route({ preferences: [{ segmentId: 'sal-slp', preference: 'avoid' }] });
    expect(avoidMain.corridor.code).toBe('MTY-GDL-ZAC');
    expect(avoidMain.usesAvoided).toBe(false);

    const avoidShared = route({ preferences: [{ segmentId: 'mty-sal', preference: 'avoid' }] });
    expect(avoidShared.usesAvoided).toBe(true);
    expect(avoidShared.segments[0]?.preference).toBe('avoid');
  });

  it('lets preferred segments outweigh tolls', () => {
    const r = route({ preferences: [{ segmentId: 'sal-zac', preference: 'prefer' }] });
    expect(r.corridor.code).toBe('MTY-GDL-ZAC');
    expect(r.preferredCount).toBe(1);
  });

  it('warns about risky segments only inside their band, and avoids them when it can', () => {
    const night = corridors({ main: [{}, { risks: [risk('high', 22, 6)] }] });
    const morning = route({ corridors: night });
    expect(morning.warnings).toEqual([]);
    expect(morning.corridor.code).toBe('MTY-GDL-SLP');

    // Leaving at 20:00, Saltillo – SLP is crossed from ~21:33: high risk at night.
    const evening = suggestRoute({
      origin: APODACA,
      destination: TLAQ,
      departAt: EVENING,
      axleCount: 5,
      corridors: night,
    });
    expect(evening.source === 'catalog' && evening.corridor.code).toBe('MTY-GDL-ZAC');

    const onlyWay = suggestRoute({
      origin: APODACA,
      destination: TLAQ,
      departAt: EVENING,
      axleCount: 5,
      corridors: night.slice(0, 1),
    });
    if (onlyWay.source !== 'catalog') throw new Error('expected a route');
    expect(onlyWay.highRiskCount).toBe(1);
    expect(onlyWay.warnings[0]).toMatchObject({
      segmentId: 'sal-slp',
      level: 'high',
      passAt: '2026-10-22T03:33:00.000Z',
    });
    const [warning] = onlyWay.warnings;
    if (!warning) throw new Error('expected a warning');
    expect(riskWarningText(warning)).toBe(
      'Tramo con riesgo alto de noche: Saltillo – San Luis Potosí (robo a transporte de carga)',
    );
  });

  it('marks missing tariffs and stops comparing tolls, falling back to distance', () => {
    // Main has an unknown tariff; the alternative is cheaper only because of it.
    const missing = corridors({ main: [{}, { tolls: [toll(null)] }] });
    const r = route({ corridors: missing });
    expect(r.corridor.code).toBe('MTY-GDL-SLP');
    expect(r.tollsMissing).toBe(true);
    expect(r.tollsCents).toBe(44_200);
    expect(r.segments[1]?.tollCents).toBeNull();
    expect(tollsText(r)).toBe('Casetas estimadas: desde $442.00');

    const noClass = route({ axleCount: 2 });
    expect(noClass.tollsCents).toBe(0);
    expect(tollsText(noClass)).toBe(`${roadsCopy.tolls}: ${roadsCopy.noData}`);
    expect(tollsText(route())).toBe('Casetas estimadas: $748.00');
  });
});

describe('parseRoadCatalog', () => {
  const json = JSON.parse(JSON.stringify(corridors())) as unknown[];

  it('round-trips a road_catalog() answer', () => {
    expect(parseRoadCatalog(json)).toEqual(corridors());
  });

  it('accepts numbers as strings (numeric columns) and drops malformed rows', () => {
    const [first] = json as Record<string, unknown>[];
    const withStrings = {
      ...first,
      origin: { ...MTY, radiusKm: '60.0' },
    };
    expect(parseRoadCatalog([withStrings])[0]?.origin.radiusKm).toBe(60);
    const brokenSegment = {
      ...first,
      segments: [{ ...(first?.segments as object[])[0], distanceKm: 0 }],
    };
    expect(parseRoadCatalog([brokenSegment, null, 'x'])).toEqual([]);
    expect(parseRoadCatalog({})).toEqual([]);
    const badChildren = {
      ...first,
      segments: [
        {
          ...(first?.segments as object[])[1],
          tolls: [{ vehicleClass: 'c1' }, toll(5)],
          risks: [{}, risk('low', 1, 2)],
        },
      ],
    };
    const [parsed] = parseRoadCatalog([badChildren]);
    expect(parsed?.segments[0]?.tolls).toHaveLength(1);
    expect(parsed?.segments[0]?.risks).toHaveLength(1);
  });
});

describe('preferencesForLoad', () => {
  const end = (city: string, point: { lat: number; lng: number } | null = null) => ({
    city,
    point,
  });
  const rows = [
    { segmentId: 's1', preference: 'avoid' as const, route: null },
    {
      segmentId: 's1',
      preference: 'prefer' as const,
      route: { origin: end('Guadalajara'), destination: end('Monterrey') },
    },
    {
      segmentId: 's2',
      preference: 'avoid' as const,
      route: { origin: end('Monterrey'), destination: end('Querétaro') },
    },
    {
      segmentId: 's3',
      preference: 'prefer' as const,
      route: { origin: end('monterrey '), destination: end('Guadalajara') },
    },
    {
      segmentId: 's4',
      preference: 'avoid' as const,
      route: { origin: end('Monterrey', MTY), destination: end('Guadalajara', GDL) },
    },
  ];

  it('keeps global ones and those of routes the load follows (either way); the route wins', () => {
    expect(
      preferencesForLoad(rows, { origin: end('Monterrey'), destination: end('Guadalajara') }),
    ).toEqual([
      { segmentId: 's1', preference: 'prefer' },
      { segmentId: 's3', preference: 'prefer' },
      { segmentId: 's4', preference: 'avoid' },
    ]);
    expect(
      preferencesForLoad(rows, { origin: end('Monterrey'), destination: end('León') }),
    ).toEqual([{ segmentId: 's1', preference: 'avoid' }]);
  });

  it('matches route ends by distance when both points are known', () => {
    // Apodaca → Tlaquepaque is the MTY → GDL route by its points, not by name.
    expect(
      preferencesForLoad(rows, {
        origin: end('Tlaquepaque', TLAQ),
        destination: end('Apodaca', APODACA),
      }),
    ).toEqual([
      { segmentId: 's1', preference: 'avoid' },
      { segmentId: 's4', preference: 'avoid' },
    ]);
  });
});

describe('roads in the matching', () => {
  const NOW = new Date('2026-10-21T12:00:00Z');
  const candidate: MatchCandidate = {
    loadId: 'load-1',
    vehicleId: 'unit-1',
    start: MTY,
    availableFrom: NOW.toISOString(),
    isReturnTrip: false,
    origin: APODACA,
    destination: TLAQ,
    pickupWindowStart: MORNING,
    pickupWindowEnd: '2026-10-22T14:00:00Z',
    proposedPriceCents: 3_000_000,
    homeDistanceKm: null,
    matchedRoute: null,
  };
  const distances = {
    empty: estimateLeg({ from: candidate.start, to: candidate.origin }),
    loaded: estimateLeg({ from: candidate.origin, to: candidate.destination }),
  };

  it('takes the tolls off the price per km and subtracts points per high-risk segment', () => {
    const plain = scoreCandidate(candidate, distances, undefined, NOW);
    const withRoad = scoreCandidate(candidate, distances, undefined, NOW, {
      tollsCents: 100_000,
      tollsMissing: false,
      highRiskCount: 2,
    });
    if (!plain || !withRoad) throw new Error('expected scores');
    expect(plain.breakdown.tollsCents).toBeNull();
    expect(plain.breakdown.points.highRisk).toBe(0);
    expect(withRoad.breakdown.tollsCents).toBe(100_000);
    expect(withRoad.breakdown.pricePerKmCents).toBeLessThan(plain.breakdown.pricePerKmCents);
    expect(withRoad.breakdown.points.highRisk).toBe(-10);
    expect(withRoad.score).toBeLessThan(plain.score);
    expect(matchExplanation(withRoad.breakdown)).toContain(
      '~$1,000 de casetas · 2 tramos inseguros',
    );

    const ignoreTolls = scoreCandidate(
      candidate,
      distances,
      { ...DEFAULT_MATCHING_WEIGHTS, tolls: 0, highRisk: 0 },
      NOW,
      { tollsCents: 100_000, tollsMissing: true, highRiskCount: 2 },
    );
    expect(ignoreTolls?.breakdown.pricePerKmCents).toBe(plain.breakdown.pricePerKmCents);
    expect(ignoreTolls?.breakdown.points.highRisk).toBe(0);
  });

  it('adds the suggested road to each recommendation (and the explanation)', async () => {
    const suggestRoad = createRoadSuggester({
      corridors: corridors(),
      preferences: [
        {
          segment_id: 'sal-slp',
          preference: 'avoid',
          carrier_routes: { origin_city: 'Monterrey', destination_city: 'Guadalajara' },
        },
      ],
      axlesByVehicle: new Map([['unit-1', 5]]),
    });
    const archivedRoute = createRoadSuggester({
      corridors: corridors(),
      preferences: [
        {
          segment_id: 'sal-slp',
          preference: 'avoid',
          carrier_routes: {
            origin_city: 'Monterrey',
            destination_city: 'Guadalajara',
            archived_at: '2026-10-01T00:00:00Z',
          },
        },
      ],
      axlesByVehicle: new Map(),
    });
    // Apodaca → Tlaquepaque are not the route's cities: only global preferences apply.
    const [match] = await recommend([candidate], { now: NOW, suggestRoad });
    expect(match?.road?.source === 'catalog' && match.road.corridor.code).toBe('MTY-GDL-SLP');
    expect(match?.breakdown.tollsCents).toBe(74_800);

    const [toGdl] = await recommend([{ ...candidate, origin: MTY, destination: GDL }], {
      now: NOW,
      suggestRoad,
    });
    expect(toGdl?.road?.source === 'catalog' && toGdl.road.corridor.code).toBe('MTY-GDL-ZAC');
    const [archived] = await recommend([{ ...candidate, origin: MTY, destination: GDL }], {
      now: NOW,
      suggestRoad: archivedRoute,
    });
    expect(archived?.road?.source === 'catalog' && archived.road.corridor.code).toBe('MTY-GDL-SLP');

    // With the route's stored points, Apodaca → Tlaquepaque follows MTY → GDL.
    const byPoints = createRoadSuggester({
      corridors: corridors(),
      preferences: [
        {
          segment_id: 'sal-slp',
          preference: 'avoid',
          carrier_routes: {
            origin_city: 'Monterrey',
            destination_city: 'Guadalajara',
            origin_location: ewkb(MTY),
            destination_location: ewkb(GDL),
          },
        },
      ],
      axlesByVehicle: new Map(),
    });
    const [near] = await recommend([candidate], { now: NOW, suggestRoad: byPoints });
    expect(near?.road?.source === 'catalog' && near.road.corridor.code).toBe('MTY-GDL-ZAC');

    const [none] = await recommend([{ ...candidate, destination: CDMX, vehicleId: 'unit-2' }], {
      now: NOW,
      suggestRoad,
    });
    expect(none?.road).toEqual({ source: 'none' });
    expect(none?.breakdown.tollsCents).toBeNull();
  });
});

describe('load detail helpers', () => {
  const load = {
    origin_city: 'Monterrey',
    origin_lat: MTY.lat,
    origin_lng: MTY.lng,
    destination_city: 'Guadalajara',
    destination_lat: GDL.lat,
    destination_lng: GDL.lng,
    pickup_window_start: MORNING,
  };

  it('suggests the road of a load with the route preferences that apply', () => {
    const plain = suggestLoadRoad({ corridors: corridors(), preferences: [] }, load, 5);
    expect(plain.source === 'catalog' && plain.corridor.code).toBe('MTY-GDL-SLP');
    const avoided = suggestLoadRoad(
      {
        corridors: corridors(),
        preferences: [
          {
            segment_id: 'sal-slp',
            preference: 'avoid',
            carrier_routes: { origin_city: 'Guadalajara', destination_city: 'Monterrey' },
          },
        ],
      },
      load,
      5,
    );
    expect(avoided.source === 'catalog' && avoided.corridor.code).toBe('MTY-GDL-ZAC');
    expect(suggestLoadRoad({ corridors: [], preferences: [] }, load, 5)).toEqual({
      source: 'none',
    });
  });

  it('lists the distinct segments of the corridors that serve a route', () => {
    expect(segmentsForRoute(corridors(), MTY, GDL).map((s) => s.id)).toEqual([
      'mty-sal',
      'sal-slp',
      'slp-gdl',
      'sal-zac',
      'zac-gdl',
    ]);
    expect(segmentsForRoute(corridors(), GDL, MTY)).toHaveLength(5);
    expect(segmentsForRoute(corridors(), MTY, CDMX)).toEqual([]);
    expect(segmentsForRoute(corridors(), null, GDL)).toEqual([]);
  });
});

describe('cardRoad', () => {
  it('summarizes the road of a recommendation card', () => {
    expect(cardRoad(undefined)).toEqual({ tolls: null, risky: false });
    expect(cardRoad({ source: 'none' })).toEqual({ tolls: null, risky: false });
    expect(cardRoad(route())).toEqual({ tolls: 'Casetas ~$748', risky: false });
    expect(cardRoad({ ...route(), tollsCents: 0, tollsMissing: true, highRiskCount: 1 })).toEqual({
      tolls: roadsCopy.cardTollsUnknown,
      risky: true,
    });
    expect(cardRoad({ ...route(), tollsCents: 0 }).tolls).toBeNull();
    expect(cardRoad({ ...route(), tollsMissing: true }).tolls).toBe('Casetas desde $748');
  });
});

/** Hex EWKB of a point, as PostgREST returns a geography(Point, 4326). */
function ewkb({ lat, lng }: { lat: number; lng: number }): string {
  const view = new DataView(new ArrayBuffer(25));
  view.setUint8(0, 1);
  view.setUint32(1, 0x20000001, true);
  view.setUint32(5, 4326, true);
  view.setFloat64(9, lng, true);
  view.setFloat64(17, lat, true);
  return [...new Uint8Array(view.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
