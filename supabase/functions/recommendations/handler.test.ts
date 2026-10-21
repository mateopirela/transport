// deno test supabase/functions — Edge Function `recommendations` (B08) with
// simulated Supabase and Google Routes (no network, no keys).
import assert from 'node:assert/strict';
import { handleRecommendations, type Dependencies } from './handler.ts';

const VEHICLE = '5eed0004-0000-4000-8000-000000000002';
const NOW = new Date('2026-10-20T12:00:00Z');
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

const row = (loadId: string, overrides: Record<string, unknown> = {}) => ({
  load_id: loadId,
  company_id: 'c1',
  vehicle_id: VEHICLE,
  availability_id: null,
  start_city: 'Guadalajara',
  start_state: 'Jalisco',
  start_lat: 20.628,
  start_lng: -103.356,
  available_from: at(2),
  is_return_trip: true,
  origin_city: 'Guadalajara',
  origin_state: 'Jalisco',
  origin_lat: 20.656,
  origin_lng: -103.391,
  destination_city: 'Monterrey',
  destination_state: 'Nuevo León',
  destination_lat: 25.724,
  destination_lng: -100.201,
  pickup_window_start: at(4),
  pickup_window_end: at(30),
  unit_type: 'dry_van',
  weight_kg: 18000,
  proposed_price_cents: 3_900_000,
  empty_km: 4.8,
  home_distance_km: 14.1,
  route_origin_city: 'Guadalajara',
  route_destination_city: 'Monterrey',
  ...overrides,
});

const DEFAULT_DWELL = {
  basis: 'default',
  sample_size: 0,
  wait_median_minutes: null,
  wait_p75_minutes: null,
  handling_median_minutes: null,
  handling_p75_minutes: null,
  total_median_minutes: 240,
  total_p75_minutes: 240,
};

interface Call {
  url: string;
  init: RequestInit;
}

function setup(options: {
  env?: Record<string, string>;
  rpc?: () => Response | Promise<Response>;
  cacheRows?: unknown[];
  /** Answer of consume_rate_limit (seconds to wait; 0 = allowed). */
  rateLimit?: () => Response | Promise<Response>;
  /** H4: answers of road_catalog, carrier_road_preferences and vehicles. */
  roadCatalog?: () => Response;
  roadPreferences?: unknown[];
  vehicles?: unknown[];
  /** H5: answer of site_dwell_estimate. */
  dwell?: () => Response;
}) {
  const calls: Call[] = [];
  const env: Record<string, string> = {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_ANON_KEY: 'anon-key',
    ...options.env,
  };
  const deps: Dependencies = {
    env: (name) => env[name],
    now: () => NOW,
    fetch: (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/rpc/consume_rate_limit'))
        return Promise.resolve(options.rateLimit?.() ?? Response.json(0));
      if (url.endsWith('/rpc/match_candidates')) {
        return Promise.resolve(
          options.rpc?.() ?? Response.json([row('far', { origin_lat: 20.9 }), row('near')]),
        );
      }
      if (url.endsWith('/rpc/site_dwell_estimate'))
        return Promise.resolve(options.dwell?.() ?? Response.json([DEFAULT_DWELL]));
      if (url.endsWith('/rpc/road_catalog'))
        return Promise.resolve(options.roadCatalog?.() ?? Response.json([]));
      if (url.includes('/rest/v1/carrier_road_preferences?'))
        return Promise.resolve(Response.json(options.roadPreferences ?? []));
      if (url.includes('/rest/v1/vehicles?'))
        return Promise.resolve(Response.json(options.vehicles ?? []));
      if (url.endsWith('/rpc/get_route_distances'))
        return Promise.resolve(Response.json(options.cacheRows ?? []));
      if (url.endsWith('/rpc/put_route_distances'))
        return Promise.resolve(new Response(null, { status: 204 }));
      if (url.startsWith('https://routes.googleapis.com/')) {
        return Promise.resolve(
          Response.json({ routes: [{ distanceMeters: 800_000, duration: '32400s' }] }),
        );
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    },
  };
  return { calls, deps };
}

const post = (
  body: unknown,
  headers: Record<string, string> = { Authorization: 'Bearer user-jwt' },
) =>
  new Request('http://functions.test/recommendations', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

Deno.test('answers CORS preflight and rejects other methods', async () => {
  const { deps } = setup({});
  const preflight = await handleRecommendations(
    new Request('http://x', { method: 'OPTIONS' }),
    deps,
  );
  assert.equal(preflight.status, 204);
  // Browsers may send their own request id and read the one in the response.
  assert.match(preflight.headers.get('Access-Control-Allow-Headers') ?? '', /x-request-id/u);
  assert.equal(preflight.headers.get('Access-Control-Expose-Headers'), 'x-request-id');
  assert.equal((await handleRecommendations(new Request('http://x'), deps)).status, 405);
});

Deno.test('requires the caller JWT and a valid body', async () => {
  const { deps, calls } = setup({});
  assert.equal((await handleRecommendations(post({ vehicleId: VEHICLE }, {}), deps)).status, 401);
  for (const body of [
    'not json',
    [],
    {},
    { vehicleId: 'x' },
    { vehicleId: VEHICLE, availabilityId: VEHICLE },
    { vehicleId: VEHICLE, limit: 50 },
    { vehicleId: VEHICLE, maxEmptyKm: 0 },
  ]) {
    assert.equal((await handleRecommendations(post(body), deps)).status, 400, JSON.stringify(body));
  }
  assert.equal(calls.length, 0);
});

Deno.test('fails closed without Supabase configuration', async () => {
  const { deps } = setup({ env: { SUPABASE_URL: '' } });
  assert.equal((await handleRecommendations(post({ vehicleId: VEHICLE }), deps)).status, 500);
});

Deno.test('maps match_candidates errors', async () => {
  const cases: [Response, number][] = [
    [Response.json({ code: '42501' }, { status: 403 }), 403],
    [Response.json({ code: '22023' }, { status: 400 }), 400],
    [Response.json({ code: 'PGRST301' }, { status: 401 }), 401],
    [new Response('boom', { status: 500 }), 502],
  ];
  const errors = console.error;
  console.error = () => {};
  try {
    for (const [response, status] of cases) {
      const { deps } = setup({ rpc: () => response });
      assert.equal(
        (await handleRecommendations(post({ vehicleId: VEHICLE }), deps)).status,
        status,
      );
    }
  } finally {
    console.error = errors;
  }
});

Deno.test('answers JSON with CORS when match_candidates is unreachable or malformed', async () => {
  const failures: (() => Response | Promise<Response>)[] = [
    () => Promise.reject(new TypeError('connection refused')),
    () => new Response('not json', { status: 200 }),
    () => Response.json([{ load_id: 'x' }]),
  ];
  const errors = console.error;
  console.error = () => {};
  try {
    for (const rpc of failures) {
      const { deps } = setup({ rpc });
      const response = await handleRecommendations(post({ vehicleId: VEHICLE }), deps);
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
      assert.deepEqual(await response.json(), { error: 'upstream_error' });
    }
  } finally {
    console.error = errors;
  }
});

Deno.test('ranks with estimates and never calls Google without a key', async () => {
  const { deps, calls } = setup({});
  const response = await handleRecommendations(post({ vehicleId: VEHICLE, maxEmptyKm: 100 }), deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.candidates, 2);
  assert.deepEqual(
    body.recommendations.map((r: { loadId: string }) => r.loadId),
    ['near', 'far'],
  );
  assert.equal(body.recommendations[0].breakdown.distanceSource, 'estimate');
  assert.match(
    body.recommendations[0].explanation,
    /en vacío · \$\d+\/km · .* · coincide con tu ruta GDL–MTY/u,
  );

  const rpc = calls.find((c) => c.url.endsWith('/rpc/match_candidates'))!;
  assert.equal((rpc.init.headers as Record<string, string>).Authorization, 'Bearer user-jwt');
  assert.deepEqual(JSON.parse(String(rpc.init.body)), {
    p_vehicle_id: VEHICLE,
    p_availability_id: null,
    p_max_empty_km: 100,
    p_limit: 200,
  });
  assert.equal(calls.filter((c) => c.url.includes('googleapis')).length, 0);
});

Deno.test(
  'with a key: cache first, Routes only for the misses of the top N, then stored',
  async () => {
    const { deps, calls } = setup({
      env: { SUPABASE_SERVICE_ROLE_KEY: 'service-jwt', GOOGLE_ROUTES_API_KEY: 'routes-key' },
      // The empty leg of `near` is cached.
      cacheRows: [
        {
          origin_lat: 20.63,
          origin_lng: -103.36,
          destination_lat: 20.66,
          destination_lng: -103.39,
          distance_km: 7.5,
          duration_minutes: 15,
        },
      ],
    });
    const response = await handleRecommendations(post({ vehicleId: VEHICLE, limit: 1 }), deps);
    const body = await response.json();
    assert.equal(body.recommendations.length, 1);
    const [best] = body.recommendations;
    assert.equal(best.loadId, 'near');
    assert.equal(best.breakdown.emptyKm, 7.5);
    assert.equal(best.breakdown.loadedKm, 800);
    assert.equal(best.breakdown.distanceSource, 'routes');

    const google = calls.filter((c) => c.url.includes('googleapis'));
    assert.equal(google.length, 1, 'top 1: one leg cached, one fetched');
    assert.equal(
      (google[0]!.init.headers as Record<string, string>)['X-Goog-Api-Key'],
      'routes-key',
    );
    const cacheCall = calls.find((c) => c.url.endsWith('/rpc/get_route_distances'))!;
    assert.equal(
      (cacheCall.init.headers as Record<string, string>).Authorization,
      'Bearer service-jwt',
    );
    const put = calls.find((c) => c.url.endsWith('/rpc/put_route_distances'))!;
    assert.deepEqual(JSON.parse(String(put.init.body)).p_legs, [
      {
        originLat: 20.66,
        originLng: -103.39,
        destinationLat: 25.72,
        destinationLng: -100.2,
        distanceKm: 800,
        durationMinutes: 540,
      },
    ]);
  },
);

Deno.test('new secret keys go only in the apikey header', async () => {
  const { deps, calls } = setup({ env: { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' } });
  await handleRecommendations(post({ vehicleId: VEHICLE }), deps);
  const headers = calls.find((c) => c.url.endsWith('/rpc/get_route_distances'))!.init
    .headers as Record<string, string>;
  assert.equal(headers.apikey, 'sb_secret_x');
  assert.equal(headers.Authorization, undefined);
});

Deno.test('each user is rate limited before any candidate or distance is computed', async () => {
  const allowed = setup({});
  assert.equal(
    (await handleRecommendations(post({ vehicleId: VEHICLE }), allowed.deps)).status,
    200,
  );
  const limit = allowed.calls[0]!;
  assert.ok(limit.url.endsWith('/rpc/consume_rate_limit'), 'the limit is checked first');
  assert.equal((limit.init.headers as Record<string, string>).Authorization, 'Bearer user-jwt');
  assert.deepEqual(JSON.parse(String(limit.init.body)), { p_bucket: 'recommendations' });

  const limited = setup({ rateLimit: () => Response.json(17) });
  const response = await handleRecommendations(post({ vehicleId: VEHICLE }), limited.deps);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '17');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await response.json(), { error: 'rate_limited' });
  assert.equal(limited.calls.length, 1, 'no match_candidates, cache or Routes call');
});

Deno.test('rate limit errors: unauthorized callers get 401, the rest fail closed', async () => {
  const cases: [() => Response | Promise<Response>, number][] = [
    [() => Response.json({ code: '42501' }, { status: 401 }), 401],
    [() => Response.json({ code: '42501' }, { status: 403 }), 401],
    [() => new Response('boom', { status: 500 }), 502],
    [() => Response.json('later'), 502],
    [() => Response.json(-1), 502],
    [() => Promise.reject(new TypeError('connection refused')), 502],
  ];
  const errors = console.error;
  console.error = () => {};
  try {
    for (const [rateLimit, status] of cases) {
      const { deps, calls } = setup({ rateLimit });
      assert.equal(
        (await handleRecommendations(post({ vehicleId: VEHICLE }), deps)).status,
        status,
      );
      assert.equal(calls.length, 1);
    }
  } finally {
    console.error = errors;
  }
});

// ---------------------------------------------------------------------------
// H4: suggested road of each recommendation
// ---------------------------------------------------------------------------
const place = (city: string, state: string, lat: number, lng: number) => ({
  city,
  state,
  lat,
  lng,
});
const MTY = place('Monterrey', 'Nuevo León', 25.6866, -100.3161);
const SLP = place('San Luis Potosí', 'San Luis Potosí', 22.1565, -100.9855);
const GDL = place('Guadalajara', 'Jalisco', 20.6597, -103.3496);
const segment = (
  id: string,
  from: unknown,
  to: unknown,
  distanceKm: number,
  amountCents: number | null,
) => ({
  id,
  code: id.toUpperCase(),
  name: id,
  highway: null,
  from,
  to,
  distanceKm,
  isToll: true,
  source: 'Estimado',
  sourceUrl: null,
  sourceDate: '2026-10-20',
  dataStatus: 'estimated',
  tolls: [
    {
      vehicleClass: 'c3',
      amountCents,
      source: 'CAPUFE',
      sourceUrl: null,
      validFrom: '2026-04-13',
      dataStatus: 'estimated',
    },
  ],
  risks: [],
});
const CATALOG = [
  {
    id: 'corridor-1',
    code: 'MTY-GDL-SLP',
    name: 'MTY–GDL por San Luis Potosí',
    bidirectional: true,
    origin: { ...MTY, radiusKm: 60 },
    destination: { ...GDL, radiusKm: 60 },
    segments: [
      segment('mty-slp', MTY, SLP, 500, 30_000),
      segment('slp-gdl', SLP, GDL, 400, 40_000),
    ],
  },
];

Deno.test('adds the suggested road, with the unit axles and the caller JWT', async () => {
  const { deps, calls } = setup({
    roadCatalog: () => Response.json(CATALOG),
    vehicles: [{ id: VEHICLE, kind: 'rigid', unit_type: 'torton', axle_count: null }],
  });
  const response = await handleRecommendations(post({ vehicleId: VEHICLE }), deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  const [first] = body.recommendations;
  assert.equal(first.road.source, 'catalog');
  assert.equal(first.road.reversed, true);
  assert.equal(first.road.tollClass, 'c3');
  assert.equal(first.road.tollsCents, 70_000);
  assert.equal(first.breakdown.tollsCents, 70_000);
  assert.match(first.explanation, /~\$700 de casetas/u);
  for (const path of [
    '/rpc/road_catalog',
    '/rest/v1/carrier_road_preferences?',
    '/rest/v1/vehicles?',
  ]) {
    const call = calls.find((c) => c.url.includes(path));
    assert.ok(call, path);
    assert.equal((call.init.headers as Record<string, string>).Authorization, 'Bearer user-jwt');
  }
  const vehicles = calls.find((c) => c.url.includes('/rest/v1/vehicles?'));
  assert.ok(vehicles?.url.endsWith(`id=in.(${VEHICLE})`));
});

Deno.test('works without a catalog: every road is source none', async () => {
  const { deps } = setup({});
  const body = await (await handleRecommendations(post({ vehicleId: VEHICLE }), deps)).json();
  assert.equal(body.recommendations.length, 2);
  for (const r of body.recommendations) {
    assert.deepEqual(r.road, { source: 'none' });
    assert.equal(r.breakdown.tollsCents, null);
  }
});

Deno.test('serves recommendations without roads when the catalog cannot be read', async () => {
  const { deps } = setup({
    roadCatalog: () => Response.json({ message: 'boom' }, { status: 500 }),
  });
  const response = await handleRecommendations(post({ vehicleId: VEHICLE }), deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.recommendations.length, 2);
  assert.equal(body.recommendations[0].road, undefined);
});

Deno.test(
  'adds the typical unloading time to return trips, once per site, with the caller JWT',
  async () => {
    const { deps, calls } = setup({
      rpc: () => Response.json([row('a'), row('b'), row('c', { is_return_trip: false })]),
      dwell: () =>
        Response.json([
          {
            ...DEFAULT_DWELL,
            basis: 'site',
            sample_size: 6,
            total_median_minutes: 300,
            total_p75_minutes: 330,
          },
        ]),
    });
    const body = await (await handleRecommendations(post({ vehicleId: VEHICLE }), deps)).json();
    type Row = { loadId: string; returnDwell?: { totalMedianMinutes: number; sampleSize: number } };
    const byLoad = new Map((body.recommendations as Row[]).map((r) => [r.loadId, r]));
    assert.equal(byLoad.get('a')?.returnDwell?.totalMedianMinutes, 300);
    assert.equal(byLoad.get('b')?.returnDwell?.sampleSize, 6);
    assert.equal(byLoad.get('c')?.returnDwell, undefined);
    const dwellCalls = calls.filter((c) => c.url.endsWith('/rpc/site_dwell_estimate'));
    assert.equal(dwellCalls.length, 1);
    assert.equal(
      (dwellCalls[0]?.init.headers as Record<string, string>).Authorization,
      'Bearer user-jwt',
    );
    assert.deepEqual(JSON.parse(String(dwellCalls[0]?.init.body)), {
      p_stop: 'delivery',
      p_lat: 20.628,
      p_lng: -103.356,
      p_at: null,
    });
  },
);

Deno.test('serves return trips without the typical time when it cannot be read', async () => {
  const { deps } = setup({ dwell: () => Response.json({ message: 'boom' }, { status: 500 }) });
  const response = await handleRecommendations(post({ vehicleId: VEHICLE }), deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.recommendations.length, 2);
  assert.equal(body.recommendations[0].returnDwell, undefined);
});
